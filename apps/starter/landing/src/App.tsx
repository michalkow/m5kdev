import { BrowserRouter, Route, Routes } from "react-router";
import { LandingPage } from "./LandingPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<LandingPage />} />
      </Routes>
    </BrowserRouter>
  );
}
