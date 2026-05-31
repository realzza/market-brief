# Tiny Python sidecar that fetches Trump's Truth Social posts past Cloudflare
# (see server.py for the why). Mirrors the role rsshub plays for X.
FROM python:3.12-slim

WORKDIR /app

# curl_cffi ships prebuilt wheels with a bundled, patched libcurl, so no
# system build toolchain is needed.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

EXPOSE 8000

# Internal-only health probe (no external curl needed).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/healthz').status==200 else 1)" || exit 1

CMD ["python", "server.py"]
