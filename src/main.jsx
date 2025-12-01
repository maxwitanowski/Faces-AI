import React from 'react'
import ReactDOM from 'react-dom/client'
import { MantineProvider, createTheme, rem } from '@mantine/core'
import App from './App'
import '@mantine/core/styles.css'

const theme = createTheme({
  primaryColor: 'primary',
  colors: {
    // Custom palette generation for 'primary' (shades of #a1abd4)
    primary: [
      '#eff1f8',
      '#dbe0f0',
      '#b6c0e3',
      '#8e9ed6',
      '#6e82cc',
      '#5971c6',
      '#4e69c4',
      '#4058ad',
      '#384e9b',
      '#2e438a'
    ],
    // Custom palette for 'secondary' (shades of #dddbff)
    secondary: [
      '#f4f4ff',
      '#e7e7ff',
      '#cdccff',
      '#b2b0ff',
      '#9a96ff',
      '#8b85ff',
      '#837dff',
      '#706be6',
      '#635fcd',
      '#5552b5'
    ],
    dark: [
      '#C1C2C5',
      '#A6A7AB',
      '#909296',
      '#5C5F66',
      '#373A40',
      '#2C2E33',
      '#25262B',
      '#1A1B1E',
      '#141517',
      '#000000', // dark.9 is now pure black
    ],
  },
  fontFamily: 'Verdana, sans-serif',
  headings: { fontFamily: 'Verdana, sans-serif' },
  defaultRadius: 'md',
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark" forceColorScheme="dark">
      <style>{`
        :root {
          --mantine-color-body: #000000;
        }
        body {
          background-color: #000000;
          color: #ffffff;
        }
        /* Custom Scrollbar for dark theme */
        ::-webkit-scrollbar {
          width: 10px;
          background-color: #0a0a0a;
        }
        ::-webkit-scrollbar-thumb {
          background-color: #333;
          border-radius: 5px;
        }
      `}</style>
      <App />
    </MantineProvider>
  </React.StrictMode>,
)
