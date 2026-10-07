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

          <h3>📍 Posisjonsping og GPS</h3>
          <p class="small"><strong>Posisjonsping</strong> (📍-knappen øverst i PWA-appen på mobil) er en hurtigknapp for å dele nøyaktig hvor du befinner deg akkurat nå, med et valgfritt kort kontekstfelt (f.eks. «Bråk ved inngang A»). Bruk denne når noen i felt (f.eks. en vekter over samband) sier fra om noe, og du raskt vil vise KO nøyaktig posisjon.</p>
          <p class="small">Du kan også legge til GPS-posisjon på en <strong>vanlig loggføring</strong> – trykk "📍 Legg til GPS-posisjon" rett under lokasjonsfeltet når du fyller ut skjemaet.</p>
          <p class="small">Appen prøver å oppnå en nøyaktighet på 5 meter eller bedre i inntil 15 sekunder, men gir aldri opp – den sender med beste oppnådde nøyaktighet uansett, og viser alltid tallet tydelig (grønt ved 5 m eller bedre, gult/oransje ved dårligere) slik at mottakeren vet hvor mye å stole på posisjonen. Nøyaktigheten er ofte dårligere innendørs, i telt, eller mellom høye scener/rigger.</p>
          <p class="small">Loggføringer/pinger med posisjon får en "📍 Åpne kart"-knapp. Har arrangementet et <strong>eget, opplastet kart</strong> (satt opp av admin under "Egendefinert kart" i adminpanelet) og punktet ligger innenfor dette kartets område, vises punktet på deres eget kart. Ellers åpnes Google Maps automatisk i stedet.</p>

          <h3>Status-rubrikken</h3>
          <p class="small">Øverst i høyre kolonne finner du "Status" – en sanntidsoversikt som viser <strong>siste registrerte beredskapsnivå og scenefarge</strong> med tidspunkt, uten at du trenger å scrolle ned i loggen for å finne siste oppdatering.</p>
          <p class="small">Under dette listes alle <strong>åpne (ikke avsluttede) hendelser</strong>. Trykk på en hendelse for å utvide den – da vises full beskrivelse og alle kommentarer, og du kan legge til en ny oppdatering eller markere hendelsen som avsluttet, direkte der, uten å måtte lete den opp nede i selve loggen.</p>

          <h3>Oppgaver og møter</h3>
          <p class="small">Panelet «Oppgaver / Møter» viser oppgaver og møter i <strong>samme liste</strong>, merket tydelig som OPPGAVE eller MØTE. Under listen finner du knappene «+ Ny oppgave» og «+ Nytt møte», som åpner et eget vindu med feltene. Et møte har tittel, tidspunkt, møtested og flere deltakere – både eksisterende brukere (som får varsel) og navn i fritekst. Når møtet opprettes dukker det opp som en egen linje i loggen. Møtet ligger i oversikten til du trykker <strong>Avslutt møte</strong>, der du skriver referat og hva som ble vedtatt. Avslutningen havner også i loggen, med knappen «Les referat». Når du avslutter et møte kan du huke av for «Observatører kan lese referatet» – den er av som standard. Alle avsluttede møtereferat tas med som vedlegg bakerst i PDF-eksporten.</p>
          <p class="small">Når du loggfører en <strong>hendelse</strong> kan du krysse av for «Opprett møte basert på hendelse» i skjemaet. Du kan også trykke «🗓 Opprett møte basert på hendelse» på en allerede pågående hendelse, i loggen eller i Status-rubrikken – f.eks. for å starte et krisemøte mens hendelsen pågår.</p>

          <h3>Kollapsbare paneler</h3>
          <p class="small">"Ny loggføring", "Filter og søk", "Oppgaver / Møter" og "Tid" kan alle slås sammen med ▲/▼-knappen i hjørnet av panelet, for å spare plass på skjermen. Valget huskes i nettleseren til neste gang du logger inn.</p>

        </div>
      </div>`;
    box.classList.remove("hidden");
  },
};
