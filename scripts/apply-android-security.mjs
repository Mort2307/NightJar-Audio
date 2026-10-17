import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Protect the native Android window from standard screen capture.
 *
 * Fail closed if a Capacitor upgrade changes the generated template; never
 * publish an APK that silently omitted our screenshot protection patch.
 */
const activityPath = resolve('android/app/src/main/java/com/nightjar/audio/MainActivity.java');
if (!existsSync(activityPath)) {
  throw new Error('Expected generated Capacitor MainActivity not found: ' + activityPath);
}

let code = readFileSync(activityPath, 'utf8');
if (code.includes('WindowManager.LayoutParams.FLAG_SECURE')) {
  console.log('NightJar Android screenshot protection already applied.');
  process.exit(0);
}

const marker = /public\s+class\s+MainActivity\s+extends\s+BridgeActivity\s*\{/;
if (!marker.test(code)) {
  throw new Error('Capacitor MainActivity template changed; review FLAG_SECURE patch before building.');
}
if (!code.includes('import android.os.Bundle;')) {
  code = code.replace(
    /(package\s+com\.nightjar\.audio\s*;)/,
    '$1\n\nimport android.os.Bundle;\nimport android.view.WindowManager;'
  );
}
code = code.replace(marker, `public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // Block Android's standard screenshot and screen-recording paths.
    // No screenshot event is emitted or recorded by FLAG_SECURE.
    getWindow().setFlags(
      WindowManager.LayoutParams.FLAG_SECURE,
      WindowManager.LayoutParams.FLAG_SECURE
    );
  }`);
writeFileSync(activityPath, code, 'utf8');
console.log('Applied Android FLAG_SECURE to NightJar MainActivity.');
