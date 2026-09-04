window.Clock = {
  start(elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    const render = () => {
      const now = new Date();
      const time = now.toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const date = now.toLocaleDateString("no-NO", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
      el.innerHTML = `${time}<span class="date">${date}</span>`;
    };
    render();
    setInterval(render, 1000);
  },
};
