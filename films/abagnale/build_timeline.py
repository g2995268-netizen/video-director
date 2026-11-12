#!/usr/bin/env python3
"""Build timeline.json from the measured word starts of vo_1.08x.wav.

The word starts are Whisper small (int8, ru, word timestamps) on the
atempo=1.08 track, corrected in two places from the energy of the waveform:
- «просто» sits inside the 0.62 s token Whisper called «Ты» before «становишься»;
  the bursts are at 7.32 and 7.46.
- «напротив» / «тех» replace Whisper's «на» + «тех», which had swallowed the word.
«кто-то», «где-то» and «обманывал» are Whisper splits joined back into the script word.
«меняешьешь» is the second «Меняешь».
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FPS = 30
DUR = 50.1  # 1503 frames. Last word ends 48.340; the poster holds 1.760 s.

# (word, start). Starts are measured. Order is the locked script.
RAW = [
    ("L1", "Представь. Тебе шестнадцать. Ты уже умеешь подписываться чужим именем так, что банк не замечает.",
     [("Представь", 0.000), ("Тебе", 1.040), ("шестнадцать", 1.240), ("Ты", 2.220),
      ("уже", 2.360), ("умеешь", 2.540), ("подписываться", 2.840), ("чужим", 3.420),
      ("именем", 3.760), ("так", 4.180), ("что", 4.600), ("банк", 4.760),
      ("не", 5.120), ("замечает", 5.260)]),
    ("L2", "Ты не грабишь. Ты просто становишься тем, кем нужно сегодня: пилотом, врачом, адвокатом.",
     [("Ты", 6.200), ("не", 6.360), ("грабишь", 6.500), ("Ты", 7.320),
      ("просто", 7.460), ("становишься", 7.680), ("тем", 8.260), ("кем", 8.660),
      ("нужно", 8.760), ("сегодня", 9.100), ("пилотом", 10.000), ("врачом", 10.800),
      ("адвокатом", 11.480)]),
    ("L3", "Они смотрят на форму. На документы. На улыбку. И не задают лишних вопросов.",
     [("Они", 12.580), ("смотрят", 12.740), ("на", 13.160), ("форму", 13.280),
      ("На", 14.000), ("документы", 14.120), ("На", 15.000), ("улыбку", 15.160),
      ("И", 15.920), ("не", 16.100), ("задают", 16.220), ("лишних", 16.560),
      ("вопросов", 16.900)]),
    ("L4", "Ты переезжаешь. Меняешь имя. Меняешь город. Каждый раз ты кто-то другой.",
     [("Ты", 17.960), ("переезжаешь", 18.140), ("Меняешь", 19.140), ("имя", 19.500),
      ("Меняешь", 20.160), ("город", 20.580), ("Каждый", 21.360), ("раз", 21.760),
      ("ты", 21.980), ("кто-то", 22.240), ("другой", 22.540)]),
    ("L5", "Один человек уже несколько лет смотрит на твои чеки. Он знает почерк. Он знает, что ты снова где-то рядом.",
     [("Один", 23.540), ("человек", 23.820), ("уже", 24.140), ("несколько", 24.400),
      ("лет", 24.800), ("смотрит", 25.180), ("на", 25.620), ("твои", 25.720),
      ("чеки", 25.940), ("Он", 26.740), ("знает", 26.880), ("почерк", 27.120),
      ("Он", 27.680), ("знает", 28.020), ("что", 28.440), ("ты", 28.580),
      ("снова", 28.680), ("где-то", 29.000), ("рядом", 29.360)]),
    ("L6", "Ты думаешь, что ты всегда на шаг впереди. Он думает иначе.",
     [("Ты", 30.180), ("думаешь", 30.320), ("что", 30.720), ("ты", 30.860),
      ("всегда", 30.960), ("на", 31.280), ("шаг", 31.480), ("впереди", 31.680),
      ("Он", 32.620), ("думает", 32.820), ("иначе", 33.180)]),
    ("L7", "Потом тебя ловят. Не потому что ты ошибся в подписи. А потому что ты устал бежать.",
     [("Потом", 34.080), ("тебя", 34.300), ("ловят", 34.540), ("Не", 35.320),
      ("потому", 35.440), ("что", 35.700), ("ты", 35.920), ("ошибся", 36.020),
      ("в", 36.420), ("подписи", 36.500), ("А", 37.440), ("потому", 37.500),
      ("что", 37.820), ("ты", 38.000), ("устал", 38.120), ("бежать", 38.500)]),
    ("L8", "Через годы ты сидишь напротив тех, кого раньше обманывал. И объясняешь им, как не повторить твои ошибки.",
     [("Через", 39.520), ("годы", 39.840), ("ты", 40.160), ("сидишь", 40.260),
      ("напротив", 40.560), ("тех", 41.000), ("кого", 41.300), ("раньше", 41.480),
      ("обманывал", 41.700), ("И", 42.680), ("объясняешь", 42.720), ("им", 43.400),
      ("как", 43.700), ("не", 43.780), ("повторить", 43.960), ("твои", 44.420),
      ("ошибки", 44.700)]),
    ("L9", "Ты больше не убегаешь. Ты просто рассказываешь.",
     [("Ты", 45.680), ("больше", 45.820), ("не", 46.020), ("убегаешь", 46.220),
      ("Ты", 47.180), ("просто", 47.280), ("рассказываешь", 47.540)]),
]

# Words that take their own caption when the hold until the next word is long enough.
# A leading function word shorter than 0.45 s is pulled into the punch instead.
# A punch word keeps its own caption. «устал» is not here: it must sit with
# «бежать» and hold through the silence, or the turn flashes past.
SOLO = {
    "шестнадцать", "именем", "пилотом", "врачом", "адвокатом",
    "улыбку", "почерк", "впереди", "иначе", "ловят", "подписи",
    "рассказываешь",
}

# Orange accent, one per caption. Meaning: the tell — the thing someone is trusting.
ACCENT = SOLO | {"грабишь", "другой", "чеки", "устал", "бежать", "убегаешь"}
FUNCTION = {"и", "а", "не", "на", "в", "что", "ты", "он", "как", "уже", "тем", "кем", "им"}


def frame(t):
    return int(round(t * FPS))


def build_words():
    vo, flat = [], []
    for i, (lid, text, pairs) in enumerate(RAW):
        words = [{"w": w, "t": t, "line": lid} for w, t in pairs]
        nxt = RAW[i + 1][2][0][1] if i + 1 < len(RAW) else 48.340
        vo.append({
            "id": lid,
            "text": text,
            "from": words[0]["t"],
            "to": nxt,
            "words": [{"w": w["w"], "t": w["t"]} for w in words],
        })
        flat.extend(words)
    starts = [w["t"] for w in flat]
    if starts != sorted(starts) or len(starts) != len(set(starts)):
        raise SystemExit("word starts are not strictly increasing")
    return vo, flat


def starts_sentence(word):
    """Sentence starts are stored with a capital. Mid-sentence words are not."""
    return word["w"][:1].isupper()


def build_captions(flat):
    """1–2 words, never crossing a sentence or a line.

    A one-word wind-up shorter than 0.45 s is pulled into the punch word
    that follows, so «Тебе» does not flash in front of «шестнадцать».
    """
    chunks, i, n = [], 0, len(flat)
    while i < n:
        here = flat[i]["w"].lower()
        nxt = flat[i + 1] if i + 1 < n else None
        blocked = (
            nxt is None
            or here in SOLO
            or nxt["w"].lower() in SOLO
            or nxt["line"] != flat[i]["line"]
            or starts_sentence(nxt)
        )
        if blocked:
            chunks.append([flat[i]])
            i += 1
        else:
            chunks.append([flat[i], flat[i + 1]])
            i += 2
    merged = []
    for chunk in chunks:
        if (
            merged
            and len(chunk) == 1
            and chunk[0]["w"].lower() in SOLO
            and len(merged[-1]) == 1
            and merged[-1][0]["line"] == chunk[0]["line"]
            and chunk[0]["t"] - merged[-1][0]["t"] < 0.45
        ):
            merged[-1].append(chunk[0])
            continue
        merged.append(chunk)
    caps = []
    for i, chunk in enumerate(merged):
        start = chunk[0]["t"]
        end = merged[i + 1][0]["t"] if i + 1 < len(merged) else DUR
        accent = next((w["w"] for w in chunk if w["w"].lower() in ACCENT), None)
        if accent is None:
            content = [w["w"] for w in chunk if w["w"].lower() not in FUNCTION]
            accent = content[-1] if content else chunk[-1]["w"]
        caps.append({
            "from": round(start, 3),
            "to": round(end, 3),
            "text": " ".join(w["w"].upper() for w in chunk),
            "accent": accent.upper(),
            "src": "vo:" + chunk[0]["line"],
            "words": [w["w"] for w in chunk],
        })
    return caps


def main():
    vo, flat = build_words()
    caps = build_captions(flat)
    n_words = len(flat)
    rate = n_words / 48.340

    scenes = [
        {
            "id": "s1", "start": 0.0, "end": 6.2,
            "beats": {
                "hook": 0.0, "pen1": 2.84, "pen2": 3.09, "pen3": 3.215,
                "hookOut": 3.6, "bank": 4.76,
            },
            "cueRef": {
                "hook": "L1.Представь", "pen1": "L1.подписываться",
                "pen2": "L1.подписываться+0.250", "pen3": "L1.подписываться+0.375",
                "hookOut": "hold of the name past 3.0 s", "bank": "L1.банк",
            },
            "reads": [
                {"what": "The name, before any of the story.", "from": 0.0, "to": 2.2},
                {"what": "He can already sign another person's name so a bank misses it.", "from": 2.22, "to": 5.8},
            ],
            "transitionOut": {
                "type": "scale-through", "dur": 0.45,
                "why": "The signature is what the uniform is trusted for. The check becomes the collar.",
                "bridge": "check",
            },
        },
        {
            "id": "s2", "start": 6.2, "end": 12.58,
            "beats": {"deny": 6.2, "become": 7.32, "pilot": 10.0, "doctor": 10.8, "lawyer": 11.48},
            "cueRef": {
                "deny": "L2.Ты", "become": "L2.просто",
                "pilot": "L2.пилотом", "doctor": "L2.врачом", "lawyer": "L2.адвокатом",
            },
            "reads": [
                {"what": "He does not steal. He becomes whoever the day needs.", "from": 6.2, "to": 9.62},
                {"what": "Three masks, each a finished costume on its first frame.", "from": 10.0, "to": 12.14},
            ],
            "transitionOut": {
                "type": "cut", "dur": 0.0,
                "why": "The uniform works, so the next shot is the people it works on. Match on the face they fail to question.",
                "bridge": "frank",
            },
        },
        {
            "id": "s3", "start": 12.58, "end": 17.96,
            "beats": {"look": 12.58, "form": 13.28, "papers": 14.12, "smile": 15.16, "quiet": 15.92},
            "cueRef": {
                "look": "L3.Они", "form": "L3.форму", "papers": "L3.документы",
                "smile": "L3.улыбку", "quiet": "L3.И",
            },
            "reads": [
                {"what": "They look at the uniform, the papers, the smile.", "from": 12.58, "to": 15.66},
                {"what": "They do not ask the extra question.", "from": 15.92, "to": 17.52},
            ],
            "transitionOut": {
                "type": "cut", "dur": 0.0,
                "why": "The unasked question is what lets him leave. Match the smile to the window of the next city.",
                "bridge": "frank",
            },
        },
        {
            "id": "s4", "start": 17.96, "end": 23.54,
            "beats": {"depart": 17.96, "rename": 19.14, "city": 20.16, "other": 22.54, "breath": 22.94},
            "cueRef": {
                "depart": "L4.переезжаешь", "rename": "L4.Меняешь", "city": "L4.город",
                "other": "L4.другой", "breath": "pause after L4.другой",
            },
            "reads": [
                {"what": "He moves, changes the name, changes the city.", "from": 17.96, "to": 20.86},
                {"what": "Each time he is someone else. Hold through the breath.", "from": 21.36, "to": 23.42},
            ],
            "transitionOut": {
                "type": "scale-through", "dur": 0.5,
                "why": "The same check changes job: from a ticket in his pocket to evidence on a desk.",
                "bridge": "check",
            },
        },
        {
            "id": "s5", "start": 23.54, "end": 30.18,
            "beats": {"reader": 23.54, "checks": 25.94, "hand": 27.12, "near": 29.0},
            "cueRef": {
                "reader": "L5.Один", "checks": "L5.чеки", "hand": "L5.почерк", "near": "L5.где-то",
            },
            "reads": [
                {"what": "One man has been reading the checks for years.", "from": 23.54, "to": 26.38},
                {"what": "He knows the handwriting.", "from": 26.74, "to": 28.68},
                {"what": "He knows the writer is nearby again.", "from": 28.68, "to": 29.66},
            ],
            "transitionOut": {
                "type": "cut", "dur": 0.0,
                "why": "Two beliefs about the same gap. Cut from the reader's desk to the locked two-shot.",
                "bridge": "check",
            },
        },
        {
            "id": "s6", "start": 30.18, "end": 34.08,
            "beats": {"thinks": 30.18, "step": 31.68, "otherwise": 33.18},
            "cueRef": {"thinks": "L6.думаешь", "step": "L6.впереди", "otherwise": "L6.иначе"},
            "reads": [
                {"what": "Frank thinks he is always a step ahead.", "from": 30.18, "to": 32.14},
                {"what": "The reader thinks otherwise.", "from": 32.62, "to": 33.68},
            ],
            "transitionOut": {
                "type": "cut", "dur": 0.0,
                "why": "The step ahead ends. The one impact cut of the chase, on the word that names the arrest.",
                "bridge": "frank",
            },
        },
        {
            "id": "s7", "start": 34.08, "end": 39.52,
            "beats": {
                "then": 34.08, "caught": 34.54, "notSig": 36.5,
                "tired": 38.12, "silenceIn": 38.98, "payoffHit": 39.46,
            },
            "cueRef": {
                "then": "L7.Потом", "caught": "L7.ловят", "notSig": "L7.подписи",
                "tired": "L7.устал", "silenceIn": "end of L7.бежать",
                "payoffHit": "pause before L8.Через",
            },
            "reads": [
                {"what": "They catch him.", "from": 34.08, "to": 34.98},
                {"what": "Not because the signature failed.", "from": 35.32, "to": 37.12},
                {"what": "Because he was tired of running.", "from": 37.44, "to": 38.98},
            ],
            "transitionOut": {
                "type": "time-cut", "dur": 0.0,
                "why": "Same table, years later. The check is no longer a way out. It is the lesson.",
                "bridge": "check",
            },
        },
        {
            "id": "s8", "start": 39.52, "end": DUR,
            "beats": {"years": 39.52, "sits": 40.26, "explains": 42.72, "stops": 45.68, "tells": 47.54, "poster": 48.34},
            "cueRef": {
                "years": "L8.Через", "sits": "L8.сидишь", "explains": "L8.объясняешь",
                "stops": "L9.Ты", "tells": "L9.рассказываешь", "poster": "speech end 48.340",
            },
            "reads": [
                {"what": "Years later he sits across from the people he fooled.", "from": 39.52, "to": 42.68},
                {"what": "He explains how not to repeat the mistake.", "from": 42.68, "to": 45.22},
                {"what": "He is not running. He is telling. The poster holds.", "from": 45.68, "to": DUR},
            ],
        },
    ]

    camera = [
        {"t": 0.0, "zoom": 1.00, "x": 0, "y": 40, "ease": "hold",
         "why": "Frame 0 is the poster: desk, Frank screen-left, check in frame, hook already up."},
        {"t": 2.84, "zoom": 1.08, "x": 0, "y": 10, "ease": "in-out",
         "why": "Push lands as the pen touches the paper. Settled before the strokes."},
        {"t": 6.2, "zoom": 1.10, "x": -120, "y": 0, "ease": "scale-through",
         "why": "Arrive on the uniform. Frank stays screen-left."},
        {"t": 10.0, "zoom": 1.12, "x": -180, "y": 0, "ease": "in-out",
         "why": "Truck to the pilot. First of three masks."},
        {"t": 10.8, "zoom": 1.12, "x": 0, "y": 0, "ease": "in-out",
         "why": "Truck to the doctor. Same zoom, new x. Not a second push."},
        {"t": 11.48, "zoom": 1.24, "x": 160, "y": 0, "ease": "slam-6",
         "why": "Jump on «адвокатом»: 6 frames, 1.12 to 1.24. Do not zoom back out."},
        {"t": 12.58, "zoom": 1.06, "x": 0, "y": 90, "ease": "cut",
         "why": "Low pedestal on the watchers. A cut, not a zoom-out from the lawyer."},
        {"t": 15.16, "zoom": 1.06, "x": 30, "y": 20, "ease": "in-out",
         "why": "Rise settles on the smile. Zoom stays put."},
        {"t": 17.96, "zoom": 1.10, "x": -240, "y": 0, "ease": "cut",
         "why": "Whip starts on the city boards."},
        {"t": 20.86, "zoom": 1.10, "x": 220, "y": 0, "ease": "whip-brake",
         "why": "Long brake onto the new city. Zoom locked, so this is not another push."},
        {"t": 22.54, "zoom": 1.08, "x": 0, "y": 0, "ease": "in-out",
         "why": "Hold on the empty costume through the breath."},
        {"t": 23.54, "zoom": 1.02, "x": 180, "y": 0, "ease": "scale-through",
         "why": "The check arrives on the reader's desk. Reader is screen-right."},
        {"t": 27.12, "zoom": 1.62, "x": 40, "y": -20, "ease": "slam-7",
         "why": "Jump into the ink on «почерк»: 7 frames, and the macro stays."},
        {"t": 30.18, "zoom": 1.08, "x": 0, "y": 0, "ease": "cut",
         "why": "Locked two-shot. No drift. The gap number is the read."},
        {"t": 33.18, "zoom": 1.08, "x": 36, "y": 0, "ease": "hold",
         "why": "Bias the frame toward the reader on «иначе». No zoom."},
        {"t": 34.08, "zoom": 1.00, "x": -30, "y": 0, "ease": "cut",
         "why": "Hard cut into the arrest, already at speed."},
        {"t": 34.54, "zoom": 1.30, "x": -10, "y": 0, "ease": "slam-5",
         "why": "Jump on «ловят»: 5 frames, 1.00 to 1.30, plus a 12 px shake decaying as e^(-14τ)."},
        {"t": 35.32, "zoom": 1.22, "x": 0, "y": 0, "ease": "crit",
         "why": "Stay tight. Settling is not a zoom back to the wide."},
        {"t": 38.98, "zoom": 1.16, "x": 0, "y": 8, "ease": "hold",
         "why": "Camera is still through the silence."},
        {"t": 39.46, "zoom": 1.14, "x": 0, "y": 0, "ease": "hero-spring",
         "why": "The check hits the table. The only overshoot: ζ 0.72, about 3.8%, then gone."},
        {"t": 39.52, "zoom": 1.14, "x": 0, "y": 24, "ease": "time-cut",
         "why": "Same table, years later. Both of them seated."},
        {"t": 45.68, "zoom": 1.06, "x": 0, "y": 8, "ease": "in-out",
         "why": "Slow dolly out. It finishes before the last word."},
        {"t": 47.54, "zoom": 1.04, "x": 0, "y": 0, "ease": "hold",
         "why": "Poster lock on «рассказываешь». No drift to the end."},
        {"t": DUR, "zoom": 1.04, "x": 0, "y": 0, "ease": "hold",
         "why": "Final frame is the same poster."},
    ]

    tl = {
        "meta": {
            "w": 1080, "h": 1920, "fps": FPS, "dur": DUR,
            "clock": "voice", "register": "kinetic", "loop": False,
            "grid": "none", "hookWaiver": None,
            "vo": {
                "status": "RENDERED",
                "file": "films/abagnale/audio/vo_1.08x.wav",
                "source": "films/abagnale/audio/vo_source.mp3",
                "atempo": 1.08,
                "sourceDur": 52.428,
                "renderedDur": 48.546,
                "speechEnd": 48.340,
                "rateWps": round(rate, 3),
                "asr": "faster-whisper small, int8, language ru, word timestamps, no initial prompt",
            },
            "tokens": {
                "ground": "#14181F", "paper": "#E7E1D4", "ink": "#F2F4F7",
                "accent": "#FF5C1A", "hud": "#8E99A8", "spot": "#FFE6C4",
                "accentMeans": "the tell: the mark someone is trusting",
            },
            "quantity": "gap between Frank and the reader, staged metres, labelled СХЕМА",
            "quantityValues": [
                {"t": 0.0, "gap": 12}, {"t": 17.96, "gap": 8}, {"t": 23.54, "gap": 3},
                {"t": 31.68, "gap": 1}, {"t": 34.54, "gap": 0}, {"t": 39.52, "gap": 0.9},
            ],
        },
        "objects": [
            {"id": "check", "role": "constant", "what": "One paper check. Ticket, then evidence, then the lesson on the table."},
            {"id": "frank", "role": "hero", "what": "Original flat plane, screen-left. Not a likeness of any actor."},
            {"id": "reader", "role": "hero", "what": "Original flat plane, screen-right, older, glasses. The man who learned the hand."},
            {"id": "pen", "role": "bridge", "what": "Writes the name, then points at it from the other side of the table."},
            {"id": "gap", "role": "prop", "what": "The staged distance on the one HUD plate. Labelled СХЕМА."},
        ],
        "vo": vo,
        "scenes": scenes,
        "cuts": [12.58, 17.96, 30.18, 34.08, 39.52],
        "hero": {
            "t": 39.46,
            "what": "In the pause before «Через годы», the check hits the seminar table. The chase gap is gone. The next frame is years later and he is already sitting down to tell it.",
        },
        "silences": [
            {"from": 22.94, "to": 23.42, "why": "Breath on «кто-то другой» before the reader exists."},
            {"from": 38.98, "to": 39.40, "why": "The floor drops after «устал бежать», before the table hit."},
        ],
        "sfx": [
            {"at": "s1.pen1", "offset": 0.0, "src": "pen-scratch", "gain": 0.16, "why": "The pen is the material. Three strokes, intervals 0.25 then 0.125."},
            {"at": "s1.pen2", "offset": 0.0, "src": "pen-scratch-b", "gain": 0.12, "why": "Second stroke, a different sample, quieter."},
            {"at": "s1.pen3", "offset": 0.0, "src": "pen-scratch", "gain": 0.09, "why": "Third stroke. The acceleration lands and stops."},
            {"at": "s4.depart", "offset": 0.0, "src": "whoosh-city", "gain": 0.12, "why": "The one camera whoosh. The other cuts stay dry."},
            {"at": "s5.hand", "offset": 0.0, "src": "paper-macro", "gain": 0.10, "why": "Paper, not a hit. The ink fills the frame."},
            {"at": "s7.caught", "offset": -0.02, "src": "impact-arrest", "gain": 0.22, "why": "Second-loudest hit. The arrest is the turn, not the payoff."},
            {"at": "s7.notSig", "offset": 0.0, "src": "riser-low", "gain": 0.14, "why": "The one riser. Density before the silence. It is gone at 38.98, no tail."},
            {"at": "s7.payoffHit", "offset": 0.0, "src": "impact-table", "gain": 0.32, "why": "Loudest non-voice hit, in the pause, about the level of the voice."},
            {"at": "s8.sits", "offset": 0.04, "src": "chair", "gain": 0.10, "why": "He sits. One foley, then the room is quiet."},
        ],
        "captions": caps,
        "texts": [
            {"id": "hook-frank", "text": "ФРЭНК", "from": 0.0, "to": 3.6,
             "role": "hook", "px": 140, "box": [280, 268, 520, 150]},
            {"id": "hook-name", "text": "АБИГНЕЙЛ", "from": 0.0, "to": 3.6,
             "role": "hook", "px": 112, "box": [110, 418, 860, 140]},
            {"id": "term-hand", "text": "ПОЧЕРК", "from": 27.12, "to": 28.68,
             "role": "term", "px": 108, "box": [60, 1424, 960, 120]},
            {"id": "term-sign", "text": "ПОДПИСИ", "from": 36.50, "to": 38.06,
             "role": "term", "px": 108, "box": [60, 1424, 960, 120]},
            {"id": "schema", "text": "СХЕМА", "from": 0.0, "to": DUR,
             "role": None, "px": 28, "box": [72, 620, 160, 36]},
        ],
        "terms": ["Абигнейл", "почерк", "подписи"],
        "camera": camera,
        "notes": {
            "constant": "check",
            "screenDirection": "Frank screen-left, the reader screen-right, from frame 0 onward.",
            "endingAnswersOpening": "The opening check is a way out. The last frame is the same check on the table between them, and he is telling, not leaving.",
            "hardCuts": "Five. Silent: 12.58, 30.18, 39.52. Sound: whoosh at 17.96, impact at 34.08/34.54. Scale-throughs at 6.20 and 23.54 are not cuts.",
            "deliberateWarnings": [
                "Captions are 1-2 words locked to speech, so many run under 0.7 s and over 3.5 words/s. The brief and the reference reels both require that. Merging to the 1.8 s phrase floor would put 4-5 words on screen.",
                "Абигнейл is shown in the hook and is not in the locked VO. The VO speaks in the second person and never says the name.",
            ],
            "slams": "адвокатом 6 frames, почерк 7 frames, ловят 5 frames. All under the 10-frame push.",
            "music": "Bed only, ducked about 9 dB. Pulse through the chase, out for both silences, one held tone under the last line. Not a dance grid.",
        },
    }

    out = ROOT / "timeline.json"
    out.write_text(json.dumps(tl, ensure_ascii=False, indent=2) + "\n")
    print(f"words {n_words}  rate {rate:.3f} wps  captions {len(caps)}  -> {out}")
    print(f"{'frame':>6} {'t':>7} {'dur':>6}  caption")
    for c in caps:
        dur = c["to"] - c["from"]
        flag = "  SHORT" if dur < 0.7 else ""
        print(f"{frame(c['from']):6d} {c['from']:7.3f} {dur:6.3f}  {c['text']}  [{c['accent']}]{flag}")


if __name__ == "__main__":
    main()
