import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="ai_dj_test_")
os.environ.setdefault("DATA_DIR", _tmp)
os.environ.setdefault("MUSIC_DIR", os.path.join(_tmp, "music"))
os.makedirs(os.path.join(_tmp, "music"), exist_ok=True)
