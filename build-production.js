import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import archiver from 'archiver';

const DEFAULT_BUILD_CONFIG = {
  EXTENSION_ID: '',
  BUILD_DIR: './build',
  ZIP_NAME: 'volume-for-b-production.zip'
};

async function loadBuildConfig() {
  const configPath = path.resolve('./build.config.js');

  if (!fs.existsSync(configPath)) {
    console.log('ℹ️ build.config.js não encontrado. Usando configuração padrão.');
    console.log('ℹ️ Se quiser personalizar o build, copie build.config.example.js para build.config.js');
    return DEFAULT_BUILD_CONFIG;
  }

  const configModule = await import(pathToFileURL(configPath).href);
  return {
    ...DEFAULT_BUILD_CONFIG,
    ...(configModule.default ?? configModule)
  };
}

const { EXTENSION_ID, BUILD_DIR, ZIP_NAME } = await loadBuildConfig();

console.log('🚀 Iniciando build de produção da extensão Volume for B...');

function setupBuildDir() {
  if (fs.existsSync(BUILD_DIR)) {
    console.log('🧹 Limpando build anterior...');
    fs.rmSync(BUILD_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(BUILD_DIR, { recursive: true });
}

function copyFiles() {
  console.log('📦 Copiando arquivos necessários...');

  const filesToCopy = [
    'manifest.json',
    'popup.html',
    'popup.css',
    'popup.js',
    'sw.js',
    'offscreen.html',
    'offscreen.js',
    'README.md',
    'SECURITY.md'
  ];

  filesToCopy.forEach(file => {
    if (fs.existsSync(file)) {
      fs.copyFileSync(file, path.join(BUILD_DIR, file));
    }
  });

  if (fs.existsSync('icons')) {
    fs.cpSync('icons', path.join(BUILD_DIR, 'icons'), { recursive: true });
  }

  if (fs.existsSync('_locales')) {
    fs.cpSync('_locales', path.join(BUILD_DIR, '_locales'), { recursive: true });
  }
}

function updateManifest() {
  console.log('🆔 Atualizando manifest...');

  const manifestPath = path.join(BUILD_DIR, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  if (EXTENSION_ID) {
    manifest.extension_id = EXTENSION_ID;
  } else {
    delete manifest.extension_id;
  }

  const version = manifest.version.split('.');
  version[2] = (Number.parseInt(version[2], 10) + 1).toString();
  manifest.version = version.join('.');

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`✅ Versão atualizada para: ${manifest.version}`);
  if (EXTENSION_ID) {
    console.log(`✅ Extension ID: ${EXTENSION_ID}`);
  } else {
    console.log('ℹ️ Build gerado sem extension_id customizado');
  }
}

function createZip() {
  return new Promise((resolve, reject) => {
    console.log('🗜️ Criando arquivo ZIP...');

    if (fs.existsSync(ZIP_NAME)) {
      fs.unlinkSync(ZIP_NAME);
    }

    const output = fs.createWriteStream(ZIP_NAME);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
      console.log(`📊 Arquivo ZIP criado: ${sizeInMB} MB`);
      resolve();
    });

    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);

    archive.directory(BUILD_DIR, false);
    archive.finalize();
  });
}

function validateBuild() {
  console.log('📋 Validando build...');

  const requiredFiles = [
    'manifest.json', 'popup.html', 'popup.css', 'popup.js',
    'sw.js', 'offscreen.html', 'offscreen.js', 'icons', '_locales'
  ];

  for (const file of requiredFiles) {
    const filePath = path.join(BUILD_DIR, file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`❌ Arquivo obrigatório não encontrado: ${file}`);
    }
  }

  console.log('✅ Todos os arquivos necessários estão presentes');
}

async function build() {
  try {
    setupBuildDir();
    copyFiles();
    updateManifest();
    validateBuild();
    await createZip();

    console.log('\n🎉 Build de produção concluído com sucesso!');
    console.log(`📦 Arquivo gerado: ${ZIP_NAME}`);
    if (EXTENSION_ID) {
      console.log(`🆔 Extension ID: ${EXTENSION_ID}`);
    }
    console.log('\n📝 Próximos passos:');
    console.log(`   1. Faça upload do arquivo '${ZIP_NAME}' na Chrome Web Store`);
    console.log('   2. Configure as informações da listagem');
    console.log('   3. Submeta para revisão');
    console.log('\n🔗 Chrome Web Store Developer Dashboard:');
    console.log('   https://chrome.google.com/webstore/devconsole');

  } catch (error) {
    console.error('❌ Erro durante o build:', error.message);
    globalThis.process.exit(1);
  }
}

await build();
