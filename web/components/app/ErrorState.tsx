export function ErrorState({ error, status }: { error: string; status: number }) {
  const down = status === 0;
  return (
    <div className="state err" role="alert">
      <b>{down ? "The Lineage API is not reachable" : "Something went wrong"}</b>
      {down
        ? "Start the Go server (see web/README.md) or check GO_API_URL, then reload this page."
        : error}
    </div>
  );
}
