import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.env.HISTOANNOTATOR_ROOT || process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    ...options,
  });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`,
  );
}

test('web frontend JavaScript remains syntactically valid', () => {
  run(process.execPath, ['--check', path.join(ROOT, 'app/static/app.js')]);
});

test('FastAPI web shell and liveness routes remain wired', () => {
  const main = read('app/main.py');
  assert.match(main, /@app\.get\("\/health\/live"\)/);
  assert.match(main, /@app\.get\("\/"[^)]*\)/);
  assert.match(main, /index\.html/);
  assert.match(main, /app\.mount\("\/static"/);
});

test('Capacitor runtime keeps service-worker resolution disabled on Android', () => {
  const config = JSON.parse(read('android-app/capacitor.config.json'));
  assert.equal(config.appId, 'org.juaco2r.histoannotator');
  assert.equal(config.appName, 'HistoAnnotator');
  assert.equal(config.webDir, 'www');
  assert.equal(config.android.resolveServiceWorkerRequests, false);
  assert.equal(config.android.allowMixedContent, true);
  assert.equal(config.server.cleartext, true);
});

test('Android build script remains shell-valid and injects the native dependencies', () => {
  run('bash', ['-n', path.join(ROOT, 'scripts/build_android_web.sh')]);
  const script = read('scripts/build_android_web.sh');
  assert.match(script, /__HISTOANNOTATOR_NATIVE_SERVER__/);
  assert.match(script, /polygon-clipping/);
  assert.match(script, /geotiff/);
  assert.match(script, /openseadragon/);
  assert.match(script, /cp "\$SOURCE\/index\.html"/);
  assert.match(script, /cp "\$SOURCE\/service-worker\.js"/);
});

test('Android MainActivity registers both native HistoAnnotator plugins', () => {
  const mainActivity = read('android-app/android/app/src/main/java/org/juaco2r/histoannotator/MainActivity.java');
  assert.match(mainActivity, /registerPlugin\(LocalImagePlugin\.class\)/);
  assert.match(mainActivity, /registerPlugin\(ServerHttpPlugin\.class\)/);
  assert.ok(fs.existsSync(path.join(ROOT, 'android-app/android/app/src/main/java/org/juaco2r/histoannotator/LocalImagePlugin.java')));
  assert.ok(fs.existsSync(path.join(ROOT, 'android-app/android/app/src/main/java/org/juaco2r/histoannotator/ServerHttpPlugin.java')));
});

test('Desktop Python sources compile without writing into the repository', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'histoannotator-pyc-'));
  const files = fs.readdirSync(path.join(ROOT, 'desktop'))
    .filter((name) => name.endsWith('.py'))
    .map((name) => path.join(ROOT, 'desktop', name));
  run('python3', ['-m', 'py_compile', ...files], {
    env: { ...process.env, PYTHONPYCACHEPREFIX: temp },
  });
  fs.rmSync(temp, { recursive: true, force: true });
});

test('Desktop backend controller keeps /health/live as its liveness contract', () => {
  const control = read('desktop/server_control.py');
  const runner = read('desktop/server_runner.py');
  assert.match(control, /\/health\/live/);
  assert.match(runner, /os\.environ\["IMAGE_ROOT"\]/);
  assert.match(runner, /import uvicorn/);
  assert.match(runner, /uvicorn\.run/);
});

test('Docker contract keeps port 8000, health/live, and one Uvicorn worker', () => {
  const dockerfile = read('Dockerfile');
  const compose = read('docker-compose.yml');
  assert.match(dockerfile, /EXPOSE 8000/);
  assert.match(dockerfile, /\/health\/live/);
  assert.match(dockerfile, /"--workers", "1"/);
  assert.match(compose, /127\.0\.0\.1:8020:8000/);
  assert.match(compose, /container_name:\s*histoannotator/);
});
