"""
YOLO Object & Face Tracking Server
Runs as a local HTTP server that the Electron app can call for accurate tracking.
Uses YOLOv8/v11 for object detection and can lock onto specific objects.
"""

import sys
import json
import base64
import io
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from threading import Lock
import numpy as np

# Try to import required packages
try:
    from ultralytics import YOLO
    from PIL import Image
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    print("WARNING: ultralytics not installed. Run: pip install ultralytics")

# Configuration
PORT = 8765
MODEL_PATH = "yolov8n.pt"  # Use yolov8n for speed, yolov8s/m for accuracy

# Global state
model = None
model_lock = Lock()
tracked_object = None  # The class name we're tracking (e.g., "person", "cup", "phone")
tracked_object_id = None  # For tracking a specific instance

# YOLO class names (COCO dataset)
COCO_CLASSES = [
    'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
    'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat',
    'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack',
    'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball',
    'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket',
    'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
    'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair',
    'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse',
    'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink', 'refrigerator',
    'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush'
]


def load_model():
    """Load YOLO model"""
    global model
    if not YOLO_AVAILABLE:
        return False
    
    try:
        with model_lock:
            if model is None:
                print(f"Loading YOLO model: {MODEL_PATH}")
                model = YOLO(MODEL_PATH)
                print("YOLO model loaded successfully")
        return True
    except Exception as e:
        print(f"Failed to load YOLO model: {e}")
        return False


def decode_image(base64_data):
    """Decode base64 image to PIL Image"""
    try:
        # Remove data URL prefix if present
        if ',' in base64_data:
            base64_data = base64_data.split(',')[1]
        
        image_bytes = base64.b64decode(base64_data)
        image = Image.open(io.BytesIO(image_bytes))
        return image.convert('RGB')
    except Exception as e:
        print(f"Failed to decode image: {e}")
        return None


def detect_objects(image, target_class=None):
    """
    Run YOLO detection on image.
    If target_class is specified, only return detections of that class.
    Returns list of detections with normalized coordinates.
    """
    global model
    
    if model is None:
        if not load_model():
            return {"error": "YOLO model not available"}
    
    try:
        # Run inference
        with model_lock:
            results = model(image, verbose=False, conf=0.5)
        
        detections = []
        img_width, img_height = image.size
        
        for result in results:
            boxes = result.boxes
            
            for i, box in enumerate(boxes):
                cls_id = int(box.cls[0])
                cls_name = COCO_CLASSES[cls_id] if cls_id < len(COCO_CLASSES) else f"class_{cls_id}"
                confidence = float(box.conf[0])
                
                # Get bounding box (xyxy format)
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                
                # Calculate center and normalize to -1 to 1 range
                center_x = (x1 + x2) / 2
                center_y = (y1 + y2) / 2
                
                # Normalize: 0 at center, -1 to 1 at edges
                norm_x = (center_x / img_width - 0.5) * 2
                norm_y = (center_y / img_height - 0.5) * 2
                
                # Calculate size (for distance estimation)
                box_width = (x2 - x1) / img_width
                box_height = (y2 - y1) / img_height
                box_area = box_width * box_height
                
                detection = {
                    "class": cls_name,
                    "confidence": round(confidence, 3),
                    "x": round(norm_x, 4),
                    "y": round(norm_y, 4),
                    "width": round(box_width, 4),
                    "height": round(box_height, 4),
                    "area": round(box_area, 4),
                    "bbox": {
                        "x1": round(x1 / img_width, 4),
                        "y1": round(y1 / img_height, 4),
                        "x2": round(x2 / img_width, 4),
                        "y2": round(y2 / img_height, 4)
                    }
                }
                
                # Filter by target class if specified
                if target_class is None or cls_name.lower() == target_class.lower():
                    detections.append(detection)
        
        return detections
    
    except Exception as e:
        print(f"Detection error: {e}")
        return {"error": str(e)}


def find_face(detections):
    """Find the largest/most prominent face (person) in detections"""
    persons = [d for d in detections if d["class"] == "person"]
    
    if not persons:
        return None
    
    # Return the largest person (closest to camera)
    largest = max(persons, key=lambda d: d["area"])
    
    # Estimate distance based on size
    if largest["area"] > 0.15:
        distance = "close"
    elif largest["area"] > 0.05:
        distance = "medium"
    else:
        distance = "far"
    
    return {
        "detected": True,
        "x": largest["x"],
        "y": largest["y"],
        "distance": distance,
        "confidence": largest["confidence"],
        "bbox": largest["bbox"]
    }


def find_tracked_object(detections, object_name):
    """Find a specific object to track"""
    # Normalize object name
    object_name = object_name.lower().strip()
    
    # Common aliases - map user terms to COCO class names
    # COCO classes: person, bicycle, car, motorcycle, airplane, bus, train, truck, boat,
    # traffic light, fire hydrant, stop sign, parking meter, bench, bird, cat, dog, horse,
    # sheep, cow, elephant, bear, zebra, giraffe, backpack, umbrella, handbag, tie, suitcase,
    # frisbee, skis, snowboard, sports ball, kite, baseball bat, baseball glove, skateboard,
    # surfboard, tennis racket, bottle, wine glass, cup, fork, knife, spoon, bowl, banana,
    # apple, sandwich, orange, broccoli, carrot, hot dog, pizza, donut, cake, chair, couch,
    # potted plant, bed, dining table, toilet, tv, laptop, mouse, remote, keyboard, cell phone,
    # microwave, oven, toaster, sink, refrigerator, book, clock, vase, scissors, teddy bear,
    # hair drier, toothbrush
    aliases = {
        # Electronics
        "phone": ["cell phone"],
        "cellphone": ["cell phone"],
        "mobile": ["cell phone"],
        "smartphone": ["cell phone"],
        "iphone": ["cell phone"],
        "android": ["cell phone"],
        "remote": ["remote"],
        "controller": ["remote"],
        "gamepad": ["remote"],
        "joystick": ["remote"],
        "game controller": ["remote"],
        "xbox controller": ["remote"],
        "playstation controller": ["remote"],
        "tv": ["tv"],
        "television": ["tv"],
        "monitor": ["tv"],
        "screen": ["tv", "laptop"],
        "laptop": ["laptop"],
        "computer": ["laptop"],
        "notebook": ["laptop"],
        "macbook": ["laptop"],
        "keyboard": ["keyboard"],
        "mouse": ["mouse"],
        
        # Drinkware
        "cup": ["cup"],
        "mug": ["cup"],
        "glass": ["cup", "wine glass"],
        "bottle": ["bottle"],
        "water bottle": ["bottle"],
        "wine glass": ["wine glass"],
        "drink": ["cup", "bottle", "wine glass"],
        
        # People
        "face": ["person"],
        "head": ["person"],
        "me": ["person"],
        "myself": ["person"],
        "user": ["person"],
        "person": ["person"],
        "human": ["person"],
        "man": ["person"],
        "woman": ["person"],
        "guy": ["person"],
        "girl": ["person"],
        
        # Furniture
        "chair": ["chair"],
        "seat": ["chair"],
        "couch": ["couch"],
        "sofa": ["couch"],
        "bed": ["bed"],
        "table": ["dining table"],
        "desk": ["dining table"],
        
        # Food
        "apple": ["apple"],
        "banana": ["banana"],
        "orange": ["orange"],
        "pizza": ["pizza"],
        "donut": ["donut"],
        "doughnut": ["donut"],
        "cake": ["cake"],
        "sandwich": ["sandwich"],
        "hot dog": ["hot dog"],
        "hotdog": ["hot dog"],
        "carrot": ["carrot"],
        "broccoli": ["broccoli"],
        "bowl": ["bowl"],
        "food": ["pizza", "sandwich", "apple", "banana", "orange", "cake", "donut"],
        
        # Kitchen
        "fork": ["fork"],
        "knife": ["knife"],
        "spoon": ["spoon"],
        "utensil": ["fork", "knife", "spoon"],
        "microwave": ["microwave"],
        "oven": ["oven"],
        "toaster": ["toaster"],
        "sink": ["sink"],
        "refrigerator": ["refrigerator"],
        "fridge": ["refrigerator"],
        
        # Other objects
        "book": ["book"],
        "clock": ["clock"],
        "watch": ["clock"],
        "vase": ["vase"],
        "scissors": ["scissors"],
        "teddy bear": ["teddy bear"],
        "teddy": ["teddy bear"],
        "stuffed animal": ["teddy bear"],
        "toothbrush": ["toothbrush"],
        "hair drier": ["hair drier"],
        "hairdryer": ["hair drier"],
        "backpack": ["backpack"],
        "bag": ["backpack", "handbag"],
        "handbag": ["handbag"],
        "purse": ["handbag"],
        "suitcase": ["suitcase"],
        "luggage": ["suitcase"],
        "umbrella": ["umbrella"],
        "tie": ["tie"],
        "necktie": ["tie"],
        
        # Sports
        "ball": ["sports ball"],
        "sports ball": ["sports ball"],
        "frisbee": ["frisbee"],
        "skateboard": ["skateboard"],
        "surfboard": ["surfboard"],
        "tennis racket": ["tennis racket"],
        "racket": ["tennis racket"],
        "baseball bat": ["baseball bat"],
        "bat": ["baseball bat"],
        "baseball glove": ["baseball glove"],
        "glove": ["baseball glove"],
        "skis": ["skis"],
        "snowboard": ["snowboard"],
        "kite": ["kite"],
        
        # Vehicles
        "car": ["car"],
        "automobile": ["car"],
        "vehicle": ["car", "truck", "bus", "motorcycle"],
        "truck": ["truck"],
        "bus": ["bus"],
        "motorcycle": ["motorcycle"],
        "motorbike": ["motorcycle"],
        "bike": ["bicycle", "motorcycle"],
        "bicycle": ["bicycle"],
        "boat": ["boat"],
        "ship": ["boat"],
        "airplane": ["airplane"],
        "plane": ["airplane"],
        "train": ["train"],
        
        # Animals
        "cat": ["cat"],
        "kitty": ["cat"],
        "dog": ["dog"],
        "puppy": ["dog"],
        "bird": ["bird"],
        "horse": ["horse"],
        "cow": ["cow"],
        "sheep": ["sheep"],
        "elephant": ["elephant"],
        "bear": ["bear"],
        "zebra": ["zebra"],
        "giraffe": ["giraffe"],
        "animal": ["cat", "dog", "bird", "horse", "cow", "sheep", "elephant", "bear"],
        
        # Plants
        "plant": ["potted plant"],
        "potted plant": ["potted plant"],
        "flower": ["potted plant"],
        
        # Misc
        "bench": ["bench"],
        "toilet": ["toilet"],
        "fire hydrant": ["fire hydrant"],
        "hydrant": ["fire hydrant"],
        "stop sign": ["stop sign"],
        "traffic light": ["traffic light"],
        "parking meter": ["parking meter"],
    }
    
    # Get all possible names for this object
    search_names = [object_name]
    if object_name in aliases:
        search_names.extend(aliases[object_name])
    
    # Find matching detections
    matches = []
    for d in detections:
        cls_lower = d["class"].lower()
        if cls_lower in search_names or object_name in cls_lower:
            matches.append(d)
    
    if not matches:
        return None
    
    # Return the largest/most confident match
    best = max(matches, key=lambda d: d["area"] * d["confidence"])
    
    return {
        "detected": True,
        "class": best["class"],
        "x": best["x"],
        "y": best["y"],
        "confidence": best["confidence"],
        "bbox": best["bbox"]
    }


class TrackingHandler(BaseHTTPRequestHandler):
    """HTTP request handler for tracking requests"""
    
    def log_message(self, format, *args):
        # Suppress default logging
        pass
    
    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
    
    def do_OPTIONS(self):
        """Handle CORS preflight"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def do_GET(self):
        """Handle GET requests"""
        if self.path == '/health':
            self.send_json({
                "status": "ok",
                "yolo_available": YOLO_AVAILABLE,
                "model_loaded": model is not None,
                "tracked_object": tracked_object
            })
        elif self.path == '/classes':
            self.send_json({"classes": COCO_CLASSES})
        else:
            self.send_json({"error": "Unknown endpoint"}, 404)
    
    def do_POST(self):
        """Handle POST requests"""
        global tracked_object
        
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')
        
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self.send_json({"error": "Invalid JSON"}, 400)
            return
        
        # Route based on path
        if self.path == '/detect':
            # Full detection - returns all objects
            image_data = data.get('image')
            if not image_data:
                self.send_json({"error": "No image provided"}, 400)
                return
            
            image = decode_image(image_data)
            if image is None:
                self.send_json({"error": "Failed to decode image"}, 400)
                return
            
            start_time = time.time()
            detections = detect_objects(image)
            elapsed = round((time.time() - start_time) * 1000, 1)
            
            if isinstance(detections, dict) and "error" in detections:
                self.send_json(detections, 500)
            else:
                self.send_json({
                    "success": True,
                    "detections": detections,
                    "count": len(detections),
                    "elapsed_ms": elapsed
                })
        
        elif self.path == '/track/face':
            # Face tracking - returns face position
            image_data = data.get('image')
            if not image_data:
                self.send_json({"error": "No image provided"}, 400)
                return
            
            image = decode_image(image_data)
            if image is None:
                self.send_json({"error": "Failed to decode image"}, 400)
                return
            
            start_time = time.time()
            detections = detect_objects(image, target_class="person")
            elapsed = round((time.time() - start_time) * 1000, 1)
            
            if isinstance(detections, dict) and "error" in detections:
                self.send_json(detections, 500)
                return
            
            face = find_face(detections)
            
            self.send_json({
                "success": True,
                "face": face or {"detected": False, "x": 0, "y": 0},
                "elapsed_ms": elapsed
            })
        
        elif self.path == '/track/object':
            # Track a specific object
            image_data = data.get('image')
            object_name = data.get('object') or tracked_object
            
            if not image_data:
                self.send_json({"error": "No image provided"}, 400)
                return
            
            if not object_name:
                self.send_json({"error": "No object specified to track"}, 400)
                return
            
            image = decode_image(image_data)
            if image is None:
                self.send_json({"error": "Failed to decode image"}, 400)
                return
            
            start_time = time.time()
            detections = detect_objects(image)
            elapsed = round((time.time() - start_time) * 1000, 1)
            
            if isinstance(detections, dict) and "error" in detections:
                self.send_json(detections, 500)
                return
            
            result = find_tracked_object(detections, object_name)
            
            self.send_json({
                "success": True,
                "tracking": object_name,
                "object": result or {"detected": False, "x": 0, "y": 0},
                "elapsed_ms": elapsed
            })
        
        elif self.path == '/track/set':
            # Set the object to track
            object_name = data.get('object')
            tracked_object = object_name
            print(f"[YOLO] Now tracking: {object_name}")
            self.send_json({
                "success": True,
                "tracking": tracked_object
            })
        
        elif self.path == '/track/clear':
            # Clear tracked object (go back to face tracking)
            # Note: global is already declared at top of do_POST
            tracked_object = None
            print("[YOLO] Cleared tracking, back to face mode")
            self.send_json({
                "success": True,
                "tracking": None
            })
        
        elif self.path == '/track/auto':
            # Auto tracking - face by default, or tracked object if set
            image_data = data.get('image')
            if not image_data:
                self.send_json({"error": "No image provided"}, 400)
                return
            
            image = decode_image(image_data)
            if image is None:
                self.send_json({"error": "Failed to decode image"}, 400)
                return
            
            start_time = time.time()
            detections = detect_objects(image)
            elapsed = round((time.time() - start_time) * 1000, 1)
            
            if isinstance(detections, dict) and "error" in detections:
                self.send_json(detections, 500)
                return
            
            # If tracking an object, find it
            if tracked_object:
                result = find_tracked_object(detections, tracked_object)
                mode = "object"
                # Debug: if object not found, log what we detected
                if not result and len(detections) > 0:
                    detected_classes = list(set([d["class"] for d in detections]))
                    print(f"[YOLO] Looking for '{tracked_object}' but only found: {detected_classes}")
            else:
                result = find_face(detections)
                mode = "face"
            
            # Log tracking results
            if result and result.get('detected'):
                print(f"[YOLO] Tracking {mode}: x={result['x']:.2f}, y={result['y']:.2f}")
            
            self.send_json({
                "success": True,
                "mode": mode,
                "tracking": tracked_object,
                "position": result or {"detected": False, "x": 0, "y": 0},
                "all_detections": len(detections),
                "elapsed_ms": elapsed
            })
        
        else:
            self.send_json({"error": "Unknown endpoint"}, 404)


def main():
    """Start the tracking server"""
    print("=" * 50)
    print("YOLO Tracking Server")
    print("=" * 50)
    
    if not YOLO_AVAILABLE:
        print("\nERROR: ultralytics package not installed!")
        print("Run: pip install ultralytics pillow")
        print("\nServer will start but tracking won't work.")
    else:
        # Pre-load model
        print("\nLoading YOLO model...")
        if load_model():
            print("Model ready!")
        else:
            print("Failed to load model. Check if yolov8n.pt exists.")
    
    print(f"\nStarting server on port {PORT}...")
    print(f"Endpoints:")
    print(f"  GET  /health        - Check server status")
    print(f"  GET  /classes       - List detectable classes")
    print(f"  POST /detect        - Detect all objects")
    print(f"  POST /track/face    - Track face position")
    print(f"  POST /track/object  - Track specific object")
    print(f"  POST /track/set     - Set object to track")
    print(f"  POST /track/clear   - Clear tracking (back to face)")
    print(f"  POST /track/auto    - Auto track (face or set object)")
    print("=" * 50)
    
    server = HTTPServer(('localhost', PORT), TrackingHandler)
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        server.shutdown()


if __name__ == '__main__':
    main()

