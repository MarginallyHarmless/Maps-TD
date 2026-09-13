"""Use the official bounded downloader with explicit proxy support for Arrow S3."""
import os
from types import SimpleNamespace
from pathlib import Path
import overturemaps.core as core
from overturemaps.cli import cli

proxy = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')
if proxy:
    s3 = core.fs.S3FileSystem
    core.fs = SimpleNamespace(S3FileSystem=lambda **kw: s3(proxy_options=proxy, **kw))
root = Path(__file__).resolve().parents[1]
cli(args=['download','--bbox=26.12531,44.42288,26.13285,44.42828',
    '--release=2026-08-19.0','-f','geojson','--type=building','-o',str(root/'data/raw/overture.geojson')])
