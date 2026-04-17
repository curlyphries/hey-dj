FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download Kokoro ONNX model files
RUN python - <<'EOF'
from huggingface_hub import hf_hub_download
import os
hf_hub_download(repo_id="hexgrad/Kokoro-82M-ONNX", filename="kokoro-v1_0.onnx", local_dir=".")
hf_hub_download(repo_id="hexgrad/Kokoro-82M-ONNX", filename="voices.bin", local_dir=".")
EOF

COPY . .

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
