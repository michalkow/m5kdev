import { NuqsAdapter } from "nuqs/adapters/react-router/v7";
import { BrowserRouter } from "react-router";
import { Providers } from "./Providers";

export function App() {
  return (
    <NuqsAdapter>
      <BrowserRouter>
        <Providers />
      </BrowserRouter>
    </NuqsAdapter>
  );
}
