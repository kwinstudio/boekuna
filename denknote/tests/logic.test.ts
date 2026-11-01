import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildAnalyzeInput,
  buildChatInput,
  CHAT_PRESETS,
  extractOutputText,
  isEmptySuggestion,
  isMeaningfulChange,
  isUuid,
  noteText,
  parseJsonSafe,
  SUGGESTION_SCHEMA,
  validateSuggestion,
} from '../supabase/functions/_shared/logic';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

const PAKKET = 'Ik wil een app bouwen waarmee je pakketjes van DHL, PostNL en DPD op één plek kunt volgen.';

test('betekenisvolle wijziging: eerste analyse van een echte zin telt', () => {
  assert.equal(isMeaningfulChange(null, PAKKET), true);
  assert.equal(isMeaningfulChange('', PAKKET), true);
});

test('betekenisvolle wijziging: te korte tekst telt niet', () => {
  assert.equal(isMeaningfulChange(null, 'hoi'), false);
  assert.equal(isMeaningfulChange(null, 'een idee'), false);
});

test('kleine aanpassingen veroorzaken geen nieuw AI-verzoek', () => {
  assert.equal(isMeaningfulChange(PAKKET, PAKKET + ' '), false);
  assert.equal(isMeaningfulChange(PAKKET, PAKKET.replace('pakketjes', 'pakketten')), false); // typfout/woordkeus
  assert.equal(isMeaningfulChange(PAKKET, PAKKET.replace('.', '!')), false); // interpunctie
  assert.equal(isMeaningfulChange(PAKKET, PAKKET + ' Snel.'), false); // één woord
});

test('een nieuwe zin of herschrijving telt wel', () => {
  const more = PAKKET + ' Gebruikers moeten ook automatisch hun bestellingen uit de mailbox kunnen importeren.';
  assert.equal(isMeaningfulChange(PAKKET, more), true);
  assert.equal(isMeaningfulChange(PAKKET, 'Een heel ander idee: een planner voor sportclubs met trainingsschema en ledenlijst.'), true);
});

test('kleine wijzigingen stapelen op t.o.v. de laatst geanalyseerde tekst', () => {
  let text = PAKKET;
  const extra = ['Ook', 'GLS', 'en', 'UPS', 'ondersteunen', 'graag', 'met', 'meldingen'];
  let triggered = false;
  for (const w of extra) {
    text += ' ' + w;
    if (isMeaningfulChange(PAKKET, text)) triggered = true;
  }
  assert.equal(triggered, true);
});

test('validatie: geldige uitvoer wordt genormaliseerd', () => {
  const s = validateSuggestion(
    {
      question: '  Wil je dat gebruikers alleen een track-en-tracecode invoeren,\n of moeten bestellingen ook automatisch verschijnen? ',
      proposed_action: 'Onderzoek welke vervoerders trackinggegevens via een API beschikbaar stellen.',
      related_note_ids: [A],
    },
    [A, B],
  );
  assert.ok(s);
  assert.equal(s!.question, 'Wil je dat gebruikers alleen een track-en-tracecode invoeren, of moeten bestellingen ook automatisch verschijnen?');
  assert.deepEqual(s!.related_note_ids, [A]);
});

test('validatie: verzonnen of niet-toegestane notitie-ID\'s worden verwijderd', () => {
  const s = validateSuggestion({ question: null, proposed_action: null, related_note_ids: [C, 'bestaat-niet', A, A, B] }, [A, B]);
  assert.deepEqual(s!.related_note_ids, [A, B]);
  const none = validateSuggestion({ question: null, proposed_action: null, related_note_ids: [C] }, []);
  assert.deepEqual(none!.related_note_ids, []);
  assert.equal(isEmptySuggestion(none!), true);
});

test('validatie: maximaal twee gerelateerde notities', () => {
  const D = '44444444-4444-4444-8444-444444444444';
  const s = validateSuggestion({ question: null, proposed_action: null, related_note_ids: [A, B, D] }, [A, B, D]);
  assert.equal(s!.related_note_ids.length, 2);
});

test('validatie: dezelfde vraag komt niet terug', () => {
  const prev = ['Wil je dat gebruikers alleen een track-en-tracecode invoeren, of moeten bestellingen ook automatisch verschijnen?'];
  const s = validateSuggestion(
    { question: 'Wil je dat gebruikers alleen een track-en-tracecode invoeren of moeten bestellingen automatisch verschijnen?', proposed_action: 'Maak een lijst van vervoerders.', related_note_ids: [] },
    [],
    prev,
  );
  assert.equal(s!.question, null);
  assert.equal(s!.proposed_action, 'Maak een lijst van vervoerders.');
});

test('validatie: ongeldige uitvoer geeft null', () => {
  assert.equal(validateSuggestion(null, []), null);
  assert.equal(validateSuggestion('tekst', []), null);
  assert.equal(validateSuggestion([], []), null);
  assert.equal(validateSuggestion({ question: 'x' }, []), null);
  assert.equal(validateSuggestion({ question: 1, proposed_action: {}, related_note_ids: 'x' }, []), null);
});

test('validatie: te lange tekst wordt ingekort', () => {
  const s = validateSuggestion({ question: 'a'.repeat(1000), proposed_action: 'b'.repeat(1000), related_note_ids: [] }, []);
  assert.ok(s!.question!.length <= 240);
  assert.ok(s!.proposed_action!.length <= 200);
});

test('schema is strict-compatibel', () => {
  assert.equal(SUGGESTION_SCHEMA.additionalProperties, false);
  assert.deepEqual([...SUGGESTION_SCHEMA.required].sort(), Object.keys(SUGGESTION_SCHEMA.properties).sort());
});

test('Responses API-uitvoer uitlezen', () => {
  const resp = {
    output: [
      { type: 'reasoning', summary: [] },
      { type: 'message', content: [{ type: 'output_text', text: '{"question":null,' }, { type: 'output_text', text: '"proposed_action":null,"related_note_ids":[]}' }] },
    ],
  };
  const parsed = parseJsonSafe(extractOutputText(resp));
  assert.deepEqual(parsed, { question: null, proposed_action: null, related_note_ids: [] });
  assert.equal(extractOutputText({ output: [] }), null);
  assert.equal(parseJsonSafe('{kapot'), null);
});

test('prompt: kandidaten en eerdere vragen worden meegegeven; notitie is data', () => {
  const input = buildAnalyzeInput({
    title: 'Pakketje',
    content: PAKKET,
    previousQuestions: ['Welke vervoerders eerst?'],
    related: [{ id: A, title: 'Webshopautomatisering', snippet: 'Bestellingen automatisch verwerken' }],
  });
  const all = input.map((m) => m.content).join('\n');
  assert.match(all, /Welke vervoerders eerst\?/);
  assert.match(all, new RegExp(A));
  assert.match(all, /geen complimenten/);
  assert.match(all, /niet als opdracht/);
});

test('chat: zonder toestemming geen andere notities in de context', () => {
  const input = buildChatInput({
    title: 'Pakketje',
    content: PAKKET,
    related: [{ id: A, title: 'Geheim', snippet: 'iets anders' }],
    history: [{ role: 'user', content: 'Hoe zou ik hier geld mee kunnen verdienen?' }],
    message: 'En abonnementen?',
    relatedAllowed: false,
  });
  const all = input.map((m) => m.content).join('\n');
  assert.doesNotMatch(all, /Geheim/);
  assert.equal(input.at(-1)!.content, 'En abonnementen?');
  assert.equal(input.filter((m) => m.role === 'user').length, 2);
});

test('chat-snelknoppen bestaan met Nederlandse labels', () => {
  assert.deepEqual(Object.values(CHAT_PRESETS).map((p) => p.label), [
    'Stel mij een goede vraag',
    'Denk kritisch mee',
    'Werk mijn idee verder uit',
    'Wat zou mijn eerste stap zijn?',
  ]);
});

test('hulpjes', () => {
  assert.equal(isUuid(A), true);
  assert.equal(isUuid('x'), false);
  assert.equal(noteText(' Titel ', ' Tekst '), 'Titel\n\nTekst');
  assert.equal(noteText('', 'Tekst'), 'Tekst');
});
