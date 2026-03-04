export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>
        Open Brain
      </h1>
      <p style={{ fontSize: "1.2rem", color: "#666", maxWidth: "500px" }}>
        Because one brain is not enough in the age of the centaur.
      </p>
      <p style={{ marginTop: "2rem", fontSize: "0.9rem", color: "#999" }}>
        MCP endpoint: <code>/api/mcp</code>
      </p>
    </main>
  );
}
