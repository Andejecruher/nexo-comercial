# WhatsApp voice-note delivery

## Audit result

The dashboard recorder requested `audio/ogg;codecs=opus` first and fell back to MP4. The backend then uploaded those original bytes using the browser-declared MIME type. It did not transcode, so a fallback recording could be an MP4/WebM file while the message metadata was marked as a voice note. This is the cause of Meta's real-format/MIME rejection.

The delivery path does not use an S3 bucket or public CDN. It uploads media directly to Meta's Media API, then sends an `audio: { "id": "..." }` reference. `PrivateMediaStore` is a private local recovery cache and is never HTTP-served; it therefore has no HTTP `Content-Type` header or public URL to probe.

## Current contract

Every non-OGG/Opus voice recording is decoded and re-encoded in memory with:

```text
ffmpeg -i pipe:0 -vn -ac 1 -c:a libopus -b:a 32k -vbr on -application voip -f ogg pipe:1
```

An already-valid OGG Opus recording is reused without invoking FFmpeg; every other source is normalized and then validated as `audio/ogg` with an Opus header. The result is uploaded to Meta with filename `.ogg` and MIME `audio/ogg`, and stored with that same MIME metadata. The backend container installs FFmpeg. Hosts outside Docker must install `ffmpeg`, or set `FFMPEG_PATH` to its executable.

Meta's Cloud API accepts either `id` or `link` in an audio media object. This integration deliberately uses the returned media `id`, which keeps citizen recordings private and does not require public-object/CDN exposure. The official message schema does **not** define `audio.voice`; OGG Opus itself makes the client render the message as a voice note. Do not add an unsupported `voice` JSON property.

## Verify before a production send

Run the repository script after generating a fixture or downloading an uploaded object:

```bash
backend/scripts/verify-whatsapp-audio.sh ./voice.ogg
backend/scripts/verify-whatsapp-audio.sh ./voice.ogg 'https://cdn.example.invalid/voice.ogg'
```

The optional URL argument runs a `curl --head --location` check and requires `Content-Type: audio/ogg`. It applies only if a future integration deliberately adopts public link delivery.

For Meta-ID delivery, inspect the upload response and send this supported payload shape:

```bash
curl --fail-with-body --request POST \
  "https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/messages" \
  --header "Authorization: Bearer ${WHATSAPP_ACCESS_TOKEN}" \
  --header 'Content-Type: application/json' \
  --data "{\"messaging_product\":\"whatsapp\",\"recipient_type\":\"individual\",\"to\":\"${PHONE_NUMBER}\",\"type\":\"audio\",\"audio\":{\"id\":\"${MEDIA_ID}\"}}"
```

If link delivery is intentionally introduced later, replace `id` with a public HTTPS `link` only after the optional HEAD check passes.
