import type { Room } from "../types";
import {
  polygonArea,
  polygonPerimeter,
  wallLengths,
  wallAreas,
  pixelAreaToM2,
} from "../geometry";

interface Props {
  rooms: Room[];
  selectedRoomId: string | null;
  onSelectRoom: (id: string | null) => void;
  scaleFactor: number | null;
  onAddRoom: () => void;
  onDeleteRoom: (id: string) => void;
  onSave: () => void;
  addingRoom: boolean;
  onFinishAddRoom: (label: string) => void;
  onCancelAddRoom: () => void;
  pendingVertexCount: number;
  saving: boolean;
}

export default function Sidebar({
  rooms,
  selectedRoomId,
  onSelectRoom,
  scaleFactor,
  onAddRoom,
  onDeleteRoom,
  onSave,
  addingRoom,
  onFinishAddRoom,
  onCancelAddRoom,
  pendingVertexCount,
  saving,
}: Props) {
  const fmt = (n: number, dp = 1) => n.toFixed(dp);

  return (
    <div style={styles.sidebar}>
      <h3 style={styles.heading}>Rooms</h3>

      {/* Action buttons */}
      <div style={styles.actions}>
        {!addingRoom ? (
          <button style={styles.btn} onClick={onAddRoom}>
            + Add Room
          </button>
        ) : (
          <AddRoomControls
            vertexCount={pendingVertexCount}
            onFinish={onFinishAddRoom}
            onCancel={onCancelAddRoom}
          />
        )}
        <button
          style={{ ...styles.btn, ...styles.saveBtn }}
          onClick={onSave}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save Corrections"}
        </button>
      </div>

      {/* Room list */}
      <div style={styles.list}>
        {rooms.length === 0 && (
          <p style={styles.empty}>No rooms yet. Use "Add Room" or upload AI results.</p>
        )}
        {rooms.map((room) => {
          const selected = room.id === selectedRoomId;
          const areaPx = polygonArea(room.vertices);
          const areaM2 = pixelAreaToM2(areaPx, scaleFactor);
          const perim = polygonPerimeter(room.vertices);
          const lengths = wallLengths(room.vertices);
          const wAreas = wallAreas(room.vertices, room.wallHeight, scaleFactor);

          return (
            <div
              key={room.id}
              style={{
                ...styles.card,
                ...(selected ? styles.cardSelected : {}),
              }}
              onClick={() => onSelectRoom(room.id)}
            >
              <div style={styles.cardHeader}>
                <strong>{room.label}</strong>
                <button
                  style={styles.deleteBtn}
                  title="Delete room"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteRoom(room.id);
                  }}
                >
                  Delete
                </button>
              </div>

              <div style={styles.metrics}>
                <div>
                  Vertices: {room.vertices.length}
                </div>
                <div>
                  Area: {fmt(areaPx, 0)} px²
                  {areaM2 != null && ` (${fmt(areaM2, 2)} m²)`}
                </div>
                <div>
                  Perimeter: {fmt(perim, 0)} px
                  {scaleFactor != null && ` (${fmt(perim / scaleFactor, 2)} m)`}
                </div>

                {selected && (
                  <>
                    <div style={styles.wallTitle}>Wall segments:</div>
                    {lengths.map((len, i) => (
                      <div key={i} style={styles.wallRow}>
                        Wall {i + 1}: {fmt(len, 0)} px
                        {scaleFactor != null && ` (${fmt(len / scaleFactor, 2)} m)`}
                        {wAreas.length > 0 && (
                          <span style={styles.wallArea}>
                            {" "}area {fmt(wAreas[i], 2)} m²
                          </span>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Add-room inline controls ---

function AddRoomControls({
  vertexCount,
  onFinish,
  onCancel,
}: {
  vertexCount: number;
  onFinish: (label: string) => void;
  onCancel: () => void;
}) {
  const inputRef = { current: "" };
  return (
    <div style={styles.addControls}>
      <p style={{ margin: 0, fontSize: 12 }}>
        Click on the plan to place vertices ({vertexCount} placed).
        {vertexCount < 3 && " Need at least 3."}
      </p>
      <input
        type="text"
        placeholder="Room label"
        style={styles.input}
        onChange={(e) => {
          inputRef.current = e.target.value;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && vertexCount >= 3 && inputRef.current.trim()) {
            onFinish(inputRef.current.trim());
          }
        }}
      />
      <div style={{ display: "flex", gap: 4 }}>
        <button
          style={styles.btn}
          disabled={vertexCount < 3}
          onClick={() => {
            const label = inputRef.current.trim() || `Room ${Date.now()}`;
            if (vertexCount >= 3) onFinish(label);
          }}
        >
          Finish
        </button>
        <button style={styles.btn} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// --- Styles ---

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 300,
    minWidth: 300,
    borderRight: "1px solid #ddd",
    background: "#fafafa",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  heading: {
    margin: 0,
    padding: "12px 16px 8px",
    fontSize: 16,
  },
  actions: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "0 16px 12px",
  },
  btn: {
    padding: "6px 10px",
    fontSize: 13,
    border: "1px solid #ccc",
    borderRadius: 4,
    background: "#fff",
    cursor: "pointer",
  },
  saveBtn: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
  },
  list: {
    flex: 1,
    overflowY: "auto",
    padding: "0 12px 12px",
  },
  empty: {
    fontSize: 13,
    color: "#888",
    padding: "8px 4px",
  },
  card: {
    border: "1px solid #ddd",
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
    cursor: "pointer",
    background: "#fff",
  },
  cardSelected: {
    borderColor: "#2563eb",
    background: "#eff6ff",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  deleteBtn: {
    fontSize: 11,
    color: "#dc2626",
    background: "none",
    border: "1px solid #fca5a5",
    borderRadius: 3,
    cursor: "pointer",
    padding: "2px 6px",
  },
  metrics: {
    fontSize: 12,
    color: "#555",
    lineHeight: 1.6,
  },
  wallTitle: {
    marginTop: 4,
    fontWeight: 600,
    color: "#333",
  },
  wallRow: {
    paddingLeft: 8,
  },
  wallArea: {
    color: "#7c3aed",
  },
  addControls: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  input: {
    padding: "5px 8px",
    fontSize: 13,
    border: "1px solid #ccc",
    borderRadius: 4,
  },
};
