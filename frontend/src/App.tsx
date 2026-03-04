import { useState, useCallback } from "react";
import UploadPage from "./components/UploadPage";
import Viewer from "./components/Viewer";
import Settings from "./components/Settings";
import ToastContainer from "./components/ToastContainer";
import { useToast } from "./hooks/useToast";
import type { JobResult, AppSettings } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import "./App.css";

/**
 * Coordinate-system contract
 * ==========================
 * The backend rasterises PDF pages at 300 DPI (see backend/app/main.py).
 * The ``<img>`` rendered inside the viewer uses the PNG's **natural** pixel
 * dimensions as its intrinsic size.  Any overlay coordinates should therefore
 * be expressed in that same pixel space and converted to/from PDF points via:
 *
 *   pdf_pt = pixel / (300 / 72)   // pixel -> PDF point
 *   pixel  = pdf_pt * (300 / 72)  // PDF point -> pixel
 */

function App() {
  const [job, setJob] = useState<JobResult | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const { toasts, addToast, dismissToast } = useToast();

  const handleUploaded = useCallback(
    (result: JobResult): void => {
      setJob(result);
      addToast("success", `PDF uploaded — ${result.page_count} page(s) converted.`);
    },
    [addToast],
  );

  const handleReset = useCallback((): void => {
    setJob(null);
  }, []);

  return (
    <div className="app">
      {job === null ? (
        <UploadPage onUploaded={handleUploaded} onAddToast={addToast} />
      ) : (
        <Viewer
          job={job}
          settings={settings}
          onReset={handleReset}
          onOpenSettings={() => setShowSettings(true)}
          onAddToast={addToast}
        />
      )}

      {showSettings && (
        <Settings
          settings={settings}
          onChange={setSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
