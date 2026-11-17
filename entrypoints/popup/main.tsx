import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const embedded = new URLSearchParams(location.search).get("embedded") === "1";
document.documentElement.classList.toggle("cc98-reborn-embedded", embedded);

createRoot(document.getElementById("root")!).render(<App />);
