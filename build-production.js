const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// Carregar configuração
let config;
try {
  config = require('./build.config.js');
} catch (error) {
  console.error('❌ Erro: Arquivo build.config.js não encontrado!');
  console.log('📋 Para corrigir:');
  console.log('   1. Copie build.config.example.js para build.config.js');
  console.log('   2. Configure seu Extension ID no arquivo');
  console.log('   3. Execute o build novamente');
  process.exit(1);
}

const { EXTENSION_ID, BUILD_DIR, ZIP_NAME } = config;

console.log('🚀 Iniciando build de produção da extensão Volume for B...');

function setupBuildDir() {
    if (fs.existsSync(BUILD_DIR)) {
        console.log('🧹 Limpando build anterior...');
        fs.rmSync(BUILD_DIR, { recursive: true });
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
}

function updateManifest() {
    console.log('🆔 Adicionando Extension ID ao manifest...');
    
    const manifestPath = path.join(BUILD_DIR, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    
    manifest.extension_id = EXTENSION_ID;
    
    const version = manifest.version.split('.');
    version[2] = (parseInt(version[2]) + 1).toString();
    manifest.version = version.join('.');
    
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✅ Versão atualizada para: ${manifest.version}`);
    console.log(`✅ Extension ID: ${EXTENSION_ID}`);
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
        'sw.js', 'offscreen.html', 'offscreen.js', 'icons'
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
        console.log(`🆔 Extension ID: ${EXTENSION_ID}`);
        console.log('\n📝 Próximos passos:');
        console.log(`   1. Faça upload do arquivo '${ZIP_NAME}' na Chrome Web Store`);
        console.log('   2. Configure as informações da listagem');
        console.log('   3. Submeta para revisão');
        console.log('\n🔗 Chrome Web Store Developer Dashboard:');
        console.log('   https://chrome.google.com/webstore/devconsole');
        
    } catch (error) {
        console.error('❌ Erro durante o build:', error.message);
        process.exit(1);
    }
}

try {
    require.resolve('archiver');
    build();
} catch (e) {
    console.log('📦 Instalando dependência archiver...');
    console.log('Execute: npm install archiver');
    console.log('Depois execute: node build-production.js');
}
