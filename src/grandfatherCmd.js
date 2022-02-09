// this is similar to push, except that existing translations in resources but not in TM
// are assumed to be in sync with source and imported into the TM
export async function grandfatherCmd(mm, quality, limitToLang) {
    await mm.updateSourceCache();
    const targetLangs = mm.getTargetLangs(limitToLang);
    const status = [];
    for (const lang of targetLangs) {
        const txCache = {};
        const jobRequest = await mm.prepareTranslationJob(lang);
        const sources = [];
        const translations = [];
        for (const tu of jobRequest.tus) {
            if (!txCache[tu.rid]) {
                const pipeline = mm.contentTypes[tu.contentType];
                const lookup = {};
                let resource;
                try {
                    // mm.verbose && console.log(`Getting ${tu.rid} for language ${lang}`);
                    resource = await pipeline.target.fetchTranslatedResource(lang, tu.rid);
                } catch (e) {
                    mm.verbose && console.log(`Couldn't fetch translated resource: ${e}`);
                } finally {
                    if (resource) {
                        const parsedResource = await pipeline.resourceFilter.parseResource({ resource, isSource: false });
                        parsedResource.segments.forEach(seg => lookup[seg.sid] = seg.str);
                    }
                }
                txCache[tu.rid] = lookup;
            }
            const previousTranslation = txCache[tu.rid][tu.sid];
            if (previousTranslation !== undefined) {
                sources.push(tu);
                translations.push({
                    guid: tu.guid,
                    rid: tu.rid,
                    sid: tu.sid,
                    src: tu.src,
                    tgt: previousTranslation,
                    q: quality,
                });
            }
        }
        mm.verbose && console.log(`Grandfathering ${lang}... found ${jobRequest.tus.length} missing translations, of which ${translations.length} existing`);
        if (translations.length > 0) {
            // eslint-disable-next-line no-unused-vars
            const { tus, ...jobResponse } = jobRequest;
            jobRequest.tus = sources;
            jobResponse.tus = translations;
            jobResponse.status = 'done';
            jobResponse.translationProvider = 'Grandfather';
            const manifest = await mm.jobStore.createJobManifest();
            await mm.processJob({ ...jobResponse, ...manifest, status: 'done' }, { ...jobRequest, ...manifest });
            status.push({
                num: translations.length,
                lang,
            });
        }
    }
    return status;
}
