window.Guide = {
  open() {
    const box = document.getElementById("history-modal");
    box.innerHTML = `
      <div class="panel" style="max-width:640px;margin:2rem auto;">
        <div class="panel-head">${Lang.t("user_guide")} <button class="ghost" onclick="document.getElementById('history-modal').classList.add('hidden')">✕</button></div>
        <div class="panel-body" style="max-height:75vh; overflow-y:auto">

          <h3 style="margin-top:0">Hva utløser et push-varsel?</h3>
          <p class="small">Disse hendelsene sender automatisk push-varsel og legger seg i Varselsenteret (🔔) til <strong>alle brukere tilknyttet arrangementet</strong> (admin + logger + observatør):</p>
          <ul>
            <li><strong>Ny loggføring med kategorien "Prioritert hendelse"</strong></li>
            <li><strong>Endring av beredskapsnivå</strong> (Grønt/Gult/Rødt) på en loggføring</li>
            <li><strong>Endring av scenefarge</strong> (Grønn/Gul/Oransje/Rød) på en loggføring</li>
          </ul>
          <p class="small">Disse varslene sendes <strong>kun til den aktuelle personen</strong>, ikke til alle:</p>
          <ul>
            <li><strong>Tildeling av en oppgave</strong> til en bestemt bruker under "Oppgaver" – kun den brukeren varsles</li>
            <li><strong>En direkte melding</strong> sendt via "✉️ Send melding" til én mottaker – kun mottakeren varsles (med mindre "Send til alle" er krysset av)</li>
          </ul>
          <p class="small">En helt vanlig loggføring (uten prioritert kategori, uten beredskapsnivå/scenefarge) sender <strong>ikke</strong> noe varsel til noen.</p>

          <h3>Hvor dukker varselet opp?</h3>
          <ul>
            <li><strong>På mobil (appen lagt til på hjemskjermen):</strong> som et vanlig push-varsel, forutsatt at brukeren har trykket "Aktiver" på push-banneret som dukker opp i appen</li>
            <li><strong>På PC (denne siden):</strong> som en liten boks oppe i høyre hjørne av skjermen mens siden er åpen, i tillegg til et vanlig skrivebordsvarsel fra nettleseren hvis du har gitt tillatelse til det (nettleseren spør om dette automatisk første gang)</li>
            <li><strong>Alltid</strong>, uansett enhet: varselet legger seg i Varselsenteret (🔔-knappen), slik at ingen går glipp av noe selv om de går glipp av selve varselet der og da</li>
          </ul>

          <h3>Varselsenteret (🔔)</h3>
          <p class="small">Viser alle varsler du har mottatt, nyeste øverst. Den røde prikken på knappen betyr at det finnes uleste varsler. Åpner du senteret, markeres alt som lest automatisk – men varslene <strong>slettes aldri</strong>, de blir liggende der du kan se dem igjen senere.</p>

          <h3>"Send melding"</h3>
          <p class="small">Kun admin og logger kan sende meldinger (ikke observatør). Dette er ren envis kommunikasjon – mottakeren kan ikke svare i appen. Du kan enten velge én bestemt mottaker, eller huke av "Send til alle tilknyttet arrangementet" for å nå alle på én gang.</p>

        </div>
      </div>`;
    box.classList.remove("hidden");
  },
};
