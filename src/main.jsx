import "./lib/polyfills.js";
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { LocaleProvider } from "./i18n.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </React.StrictMode>,
);
