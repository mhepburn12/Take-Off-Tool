import { useState } from "react";
import UploadPage from "./components/UploadPage";
import Viewer from "./components/Viewer";
import "./App.css";

/**
 * Coordinate-system contract
 * ==========================
 * The backend rasterises PDF pages at 300 DPI (see backend/app/main.py).
 * The <img> rendered inside the viewer uses the PNG's **natural** pixel
 * dimensions as its intrinsic size.  Any overlay coordinates should therefore
 * be expressed in that same pixel space and converted to/from PDF points via:
 *
 *   pdf_pt = pixel / (300 / 72)   // pixel → PDF point
 *   pixel  = pdf_pt * (300 / 72)  // PDF point → pixel
 */

export interface JobResult {
  job_id: string;
  page_count: number;
  dpi: number;
  pages: { page: number; url: string }[];
}

function App() {
  const [job, setJob] = useState<JobResult | null>(null);

  return (
    <div className="app">
      {job === null ? (
        <UploadPage onUploaded={setJob} />
      ) : (
        <Viewer job={job} onReset={() => setJob(null)} />
      )}
    </div>
  );
}

export default App;
