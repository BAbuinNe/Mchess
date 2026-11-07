import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import AdminConsole from "./AdminConsole";
import { Capacitor } from "@capacitor/core";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {window.location.pathname === "/admin" ? <AdminConsole /> : <App />}
  </React.StrictMode>
);
if (import.meta.env.PROD && !Capacitor.isNativePlatform() && "serviceWorker" in navigator) {
  window.addEventListener("load", () => { void navigator.serviceWorker.register("/sw.js"); });
}
