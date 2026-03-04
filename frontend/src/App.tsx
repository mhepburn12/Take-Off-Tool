import { useState, useCallback } from "react";
import UploadPage from "./components/UploadPage";
import Viewer from "./components/Viewer";
import type { JobResult } from "./types";
import "./App.css";

function App() {
  const [job, setJob] = useState<JobResult | null>(null);

  const handleUploaded = useCallback((result: JobResult): void => {
    setJob(result);
  }, []);

  const handleReset = useCallback((): void => {
    setJob(null);
  }, []);

  return (
    <div className="app">
      {job === null ? (
        <UploadPage onUploaded={handleUploaded} />
      ) : (
        <Viewer job={job} onReset={handleReset} />
      )}
    </div>
  );
}

export default App;
