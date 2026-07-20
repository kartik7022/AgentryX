from __future__ import annotations

import shutil
import subprocess
import time
from pathlib import Path

import pytest
import requests
import yaml


ROOT = Path(__file__).resolve().parents[1]
K8S_DIR = ROOT / "k8s"


def _docker_available() -> bool:
    if shutil.which("docker") is None:
        return False
    try:
        result = subprocess.run(
            ["docker", "info"],
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    return result.returncode == 0


@pytest.mark.skipif(not _docker_available(), reason="docker is not installed")
def test_dockerfile_builds():
    result = subprocess.run(
        ["docker", "build", "-t", "docai-test:latest", "."],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=1200,
    )
    assert result.returncode == 0, result.stderr or result.stdout


def test_k8s_yaml_files_are_valid():
    yaml_files = sorted(K8S_DIR.glob("*.yaml"))
    assert yaml_files, "expected k8s YAML files to exist"
    for yaml_file in yaml_files:
        with yaml_file.open("r", encoding="utf-8") as handle:
            docs = list(yaml.safe_load_all(handle))
        assert docs, f"{yaml_file.name} did not contain any YAML documents"
        for doc in docs:
            assert isinstance(doc, dict), f"{yaml_file.name} has invalid YAML content"
            assert "kind" in doc, f"{yaml_file.name} missing kind"


@pytest.mark.skipif(not _docker_available(), reason="docker is not installed")
def test_health_endpoint_in_container():
    image = "docai-health-test:latest"
    build = subprocess.run(
        ["docker", "build", "-t", image, "."],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=1200,
    )
    assert build.returncode == 0, build.stderr or build.stdout

    suffix = str(int(time.time()))
    network_name = f"docai-net-{suffix}"
    postgres_name = f"docai-postgres-{suffix}"
    app_name = f"docai-health-{suffix}"

    network = subprocess.run(
        ["docker", "network", "create", network_name],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert network.returncode == 0, network.stderr or network.stdout

    postgres_run = subprocess.run(
        [
            "docker",
            "run",
            "-d",
            "--rm",
            "--name",
            postgres_name,
            "--network",
            network_name,
            "-e",
            "POSTGRES_USER=docai_user",
            "-e",
            "POSTGRES_PASSWORD=docai_pass",
            "-e",
            "POSTGRES_DB=docai_db",
            "postgres:15",
        ],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert postgres_run.returncode == 0, postgres_run.stderr or postgres_run.stdout

    for _ in range(30):
        ready = subprocess.run(
            [
                "docker",
                "exec",
                postgres_name,
                "pg_isready",
                "-U",
                "docai_user",
                "-d",
                "docai_db",
            ],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            timeout=30,
        )
        if ready.returncode == 0:
            break
        time.sleep(2)
    else:
        pytest.fail("postgres container did not become ready in time")

    run = subprocess.run(
        [
            "docker",
            "run",
            "-d",
            "--rm",
            "--name",
            app_name,
            "--network",
            network_name,
            "-e",
            "AUTH_DISABLED=true",
            "-e",
            "JWT_SECRET_KEY=test-secret",
            "-e",
            "POSTGRES_HOST=" + postgres_name,
            "-e",
            "POSTGRES_USER=docai_user",
            "-e",
            "POSTGRES_PASSWORD=docai_pass",
            "-e",
            "POSTGRES_DB=docai_db",
            "-p",
            "18000:8000",
            image,
        ],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert run.returncode == 0, run.stderr or run.stdout

    try:
        for _ in range(60):
            try:
                response = requests.get("http://127.0.0.1:18000/health/", timeout=5)
                if response.status_code == 200:
                    assert response.json()["status"] == "ok"
                    return
            except requests.RequestException:
                time.sleep(2)
        pytest.fail("health endpoint did not become ready in time")
    finally:
        subprocess.run(["docker", "stop", app_name], capture_output=True, text=True, timeout=30)
        subprocess.run(["docker", "stop", postgres_name], capture_output=True, text=True, timeout=30)
        subprocess.run(["docker", "network", "rm", network_name], capture_output=True, text=True, timeout=30)
