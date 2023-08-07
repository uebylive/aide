import React from "react";
import ReactDOM from "react-dom";

import App from "./App";
import { ExplorationContextProvider } from "./context";

import "./index.css";

ReactDOM.render(
  <React.StrictMode>
    <ExplorationContextProvider exploration={0}>
      <App />
    </ExplorationContextProvider>
  </React.StrictMode>,
  document.getElementById("root")
);
