# Voice

`vo_source.mp3` is the attached ElevenLabs track (Nikolay, 44.1 kHz mono, 52.428 s).

`vo_1.08x.wav` is that track at `atempo=1.08` (pitch preserved). Measured length 48.546 s. The film is 50.100 s: the last word ends at 48.340 s, and the final poster holds the remaining 1.760 s.

Word starts in `../timeline.json` come from faster-whisper small, int8, Russian, word timestamps. Two boundaries were set from the waveform, not from a Whisper token. See `../build_timeline.py`.
