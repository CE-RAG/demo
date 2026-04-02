import { useState, useCallback } from "react";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const SEARCH_API_URL  = "/search";          // proxied search endpoint
const QDRANT_URL      = "http://192.168.248.200:6333";           // qdrant base url
const QDRANT_API_KEY  = "my-secret-api-key";                    // optional
const COLLECTION      = "nt-cctv-vehicles";
const IMAGE_PROXY_URL = "/download";    // proxied download endpoint

// ─── BACKEND REQUIRED ───────────────────────────────────────────────────────
// You need to implement a /download endpoint on your backend (SEARCH_API_URL):
//
// GET /download?path=<cloud_file_path>
//
// This endpoint should:
// 1. Read the 'path' query parameter (e.g., "s3://bucket/image.jpg")
// 2. Fetch the image from cloud storage (S3, Azure Blob, GCS, etc.)
// 3. Stream the image back with appropriate Content-Type header
//
// Example in Python/Flask:
// @app.route('/download')
// def download_image():
//     path = request.args.get('path')
//     image_data = fetch_from_cloud_storage(path)  # Your cloud storage logic
//     return Response(image_data, mimetype='image/jpeg')
//
// Example in Node.js/Express:
// app.get('/download', async (req, res) => {
//   const path = req.query.path;
//   const imageStream = await fetchFromCloudStorage(path);
//   res.set('Content-Type', 'image/jpeg');
//   imageStream.pipe(res);
// });

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/** Step 1 — query your search API */
async function searchVehicles(query, topK = 10) {
  const res = await fetch(SEARCH_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, top_k: topK }),
  });
  if (!res.ok) throw new Error(`Search API error: ${res.status}`);
  return res.json(); // [{ id, filename, score, datetime }]
}

/** Step 2 — fetch payloads from Qdrant for a list of IDs */
async function fetchQdrantPayloads(ids) {
  const res = await fetch(
    `${QDRANT_URL}/collections/${COLLECTION}/points`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(QDRANT_API_KEY ? { "api-key": QDRANT_API_KEY } : {}),
      },
      body: JSON.stringify({ ids, with_payload: true, with_vector: false }),
    }
  );
  if (!res.ok) throw new Error(`Qdrant error: ${res.status}`);
  const data = await res.json();
  // Build a map: id → file_path
  const map = {};
  for (const point of data.result ?? []) {
    map[point.id] = point.payload?.file_path ?? null;
  }
  return map;
}

/** Step 3 — build proxied image src from file_path */
function proxyImageUrl(filePath) {
  return `${IMAGE_PROXY_URL}?path=${encodeURIComponent(filePath)}`;
}

// ─── SCORE BADGE ─────────────────────────────────────────────────────────────
function ScoreBadge({ score }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 15 ? "#27500A" : pct >= 10 ? "#633806" : "#501313";
  const bg   =
    pct >= 15 ? "#EAF3DE" : pct >= 10 ? "#FAEEDA" : "#FCEBEB";
  return (
    <span style={{
      fontSize: 11, fontFamily: "monospace",
      padding: "2px 8px", borderRadius: 6,
      background: bg, color,
      whiteSpace: "nowrap",
    }}>
      {score.toFixed(4)}
    </span>
  );
}

// ─── RESULT ROW ──────────────────────────────────────────────────────────────
function ResultRow({ item, index, filePath }) {
  const [imgState, setImgState] = useState("idle"); // idle | loading | ok | err
  const src = filePath ? proxyImageUrl(filePath) : null;

  return (
    <div style={{
      display: "flex", gap: 14, alignItems: "flex-start",
      padding: "14px 0",
      borderBottom: "0.5px solid var(--color-border-tertiary)",
      animation: `fadeUp 0.25s ease both`,
      animationDelay: `${index * 40}ms`,
    }}>
      {/* thumbnail */}
      <div style={{
        flexShrink: 0, width: 120, height: 80,
        borderRadius: 8,
        background: "var(--color-background-secondary)",
        border: "0.5px solid var(--color-border-tertiary)",
        overflow: "hidden", display: "flex",
        alignItems: "center", justifyContent: "center",
      }}>
        {!src ? (
          <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>no path</span>
        ) : imgState === "err" ? (
          <a
            href={src}
            download={item.filename}
            style={{
              fontSize: 11, color: "#378ADD",
              cursor: "pointer", textDecoration: "underline",
            }}
          >
            download
          </a>
        ) : (
          <>
            {imgState !== "ok" && (
              <div style={{
                position: "absolute",
                width: 18, height: 18,
                border: "2px solid var(--color-border-secondary)",
                borderTopColor: "#378ADD",
                borderRadius: "50%",
                animation: "spin 0.7s linear infinite",
              }} />
            )}
            <a href={src} download={item.filename}>
              <img
                src={src}
                alt={item.filename}
                onLoad={() => setImgState("ok")}
                onError={() => setImgState("err")}
                style={{
                  width: "100%", height: "100%", objectFit: "cover",
                  opacity: imgState === "ok" ? 1 : 0,
                  transition: "opacity 0.2s",
                  cursor: "pointer",
                }}
              />
            </a>
          </>
        )}
      </div>

      {/* meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 500,
          color: "var(--color-text-primary)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          marginBottom: 4,
        }}>
          {item.filename}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
          <ScoreBadge score={item.score} />
          {item.datetime && (
            <span style={{
              fontSize: 11, color: "var(--color-text-secondary)",
              fontFamily: "monospace",
            }}>
              {item.datetime}
            </span>
          )}
        </div>

        {filePath && (
          <div style={{
            fontSize: 11, color: "var(--color-text-secondary)",
            fontFamily: "monospace",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {filePath}
          </div>
        )}
        {!filePath && src === null && (
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
            fetching path…
          </div>
        )}
      </div>

      {/* rank */}
      <div style={{
        flexShrink: 0, fontSize: 11,
        color: "var(--color-text-secondary)",
        fontFamily: "monospace", paddingTop: 2,
      }}>
        #{index + 1}
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function CCTVSearch() {
  const [query, setQuery]       = useState("");
  const [topK, setTopK]         = useState(10);
  const [results, setResults]   = useState([]);
  const [filePaths, setFilePaths] = useState({}); // id → file_path
  const [status, setStatus]     = useState("idle"); // idle | searching | error
  const [error, setError]       = useState("");

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setStatus("searching");
    setError("");
    setResults([]);
    setFilePaths({});

    try {
      // Step 1 — search
      const hits = await searchVehicles(query.trim(), topK);
      setResults(hits);
      setStatus("done");

      // Step 2 — fetch Qdrant payloads in one batch
      const ids = hits.map((h) => Number(h.id));
      const pathMap = await fetchQdrantPayloads(ids);
      setFilePaths(pathMap);
    } catch (e) {
      setStatus("error");
      setError(e.message);
    }
  }, [query, topK]);

  const onKeyDown = (e) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div style={{
        maxWidth: 720, margin: "0 auto", padding: "2rem 1rem",
        fontFamily: "var(--font-sans, sans-serif)",
      }}>

        {/* header */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h1 style={{
            fontSize: 20, fontWeight: 500,
            color: "var(--color-text-primary)", marginBottom: 4,
          }}>
            CCTV Vehicle Search
          </h1>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
            Search by description — click image to download
          </p>
        </div>

        {/* search bar */}
        <div style={{ display: "flex", gap: 8, marginBottom: "0.5rem" }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="e.g. เบนส์ x, black pickup, honda civic"
            style={{ flex: 1 }}
          />
          <select
            value={topK}
            onChange={(e) => setTopK(Number(e.target.value))}
            style={{ width: 72 }}
          >
            {[5, 10, 20, 50].map((n) => (
              <option key={n} value={n}>top {n}</option>
            ))}
          </select>
          <button
            onClick={handleSearch}
            disabled={status === "searching" || !query.trim()}
          >
            {status === "searching" ? "Searching…" : "Search"}
          </button>
        </div>

        {/* status bar */}
        {status === "done" && results.length > 0 && (
          <div style={{
            fontSize: 12, color: "var(--color-text-secondary)",
            marginBottom: "1rem",
          }}>
            {results.length} result{results.length !== 1 ? "s" : ""}
          </div>
        )}
        {status === "error" && (
          <div style={{
            fontSize: 13, color: "#A32D2D",
            background: "#FCEBEB", borderRadius: 8,
            padding: "10px 14px", marginBottom: "1rem",
          }}>
            {error}
          </div>
        )}

        {/* results */}
        {results.length > 0 && (
          <div>
            {results.map((item, i) => (
              <ResultRow
                key={item.id}
                item={item}
                index={i}
                filePath={filePaths[Number(item.id)] ?? null}
              />
            ))}
          </div>
        )}

        {status === "done" && results.length === 0 && (
          <div style={{
            textAlign: "center", padding: "3rem 0",
            fontSize: 14, color: "var(--color-text-secondary)",
          }}>
            No results found.
          </div>
        )}
      </div>
    </>
  );
}
