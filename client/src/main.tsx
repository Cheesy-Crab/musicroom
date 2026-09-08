import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

// basename 与部署子路径一致:线上 https://domain.com/music-room/
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename="/music-room">
      <App />
    </BrowserRouter>
  </StrictMode>
);
