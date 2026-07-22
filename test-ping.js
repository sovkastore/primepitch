const DO_URL = "https://primepitch-live-tracker.daxonicstudios.workers.dev";
fetch(`${DO_URL}/ping`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ visitor_id: "test", match_id: "test", path: "/test" }),
}).then(async r => {
  console.log(r.status, await r.text());
});
