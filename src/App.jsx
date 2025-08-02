import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Login from "./pages/login";
import "bootstrap/dist/css/bootstrap.min.css";

function App() {
  return (
      <Routes>
        <Route path="/" element={<Login />} />
      </Routes>
  );
}

export default App;
