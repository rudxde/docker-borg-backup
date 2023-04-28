//@ts-check

/**
 * @param {string} app
 * @param {{ [app: string]: {imageName: string, devTag: string, prodTag: string} }} parsedVersionFile
 */
function release(app, parsedVersionFile) {
    parsedVersionFile[app].prodTag = parsedVersionFile[app].devTag;
}

/**
 * @param {string | undefined} version
 * @param {string} app
 * @param {{ [app: string]: {imageName: string, devTag: string, prodTag: string} }} parsedVersionFile
 */
function dev(version, app, parsedVersionFile) {
    if (!version) {
        throw new Error('VERSION env is not defined');
    }
    parsedVersionFile[app].devTag = version;
}

async function main() {
    const versionFilePath = process.env.VERSION_FILE_PATH;
    const app = process.argv[2];
    const isRelease = process.argv[3] === 'release';
    const version = process.env.VERSION;

    if (!versionFilePath) {
        throw new Error('VERSION_FILE_PATH env is not defined');
    }

    if (!app) {
        throw new Error('App is not defined');
    }

    const fs = require('fs');
    const path = require('path');
    const versionFile = path.join(__dirname, versionFilePath);
    const versionFileContent = fs.readFileSync(versionFile, 'utf8');
    /** @type {{ [app: string]: {imageName: string, devTag: string, prodTag: string} }} */
    const parsedVersionFile = JSON.parse(versionFileContent);
    if (!parsedVersionFile[app]) {
        console.log(`App ${app} is not defined in ${versionFile} skipping`);
        process.exit(0);
    }

    if (isRelease) {
        release(app, parsedVersionFile);
    } else {
        dev(version, app, parsedVersionFile);
    }

    fs.writeFileSync(versionFile, JSON.stringify(parsedVersionFile, null, 4) + '\n');
    console.log(`Updated ${app} dev-version to ${version}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
