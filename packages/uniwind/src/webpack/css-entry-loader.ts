import type { LoaderContext, LoaderDefinitionFunction } from 'webpack'
import { compileVirtual } from '../metro/compileVirtual'
import { injectThemes } from '../metro/injectThemes'
import { Platform, type Polyfills } from '../metro/types'

type CssEntryLoaderOptions = {
    cssEntryPath: string
    dtsPath?: string
    themes: Array<string>
    polyfills?: Polyfills
    debug?: boolean
}

const cssEntryLoader: LoaderDefinitionFunction<CssEntryLoaderOptions> = function cssEntryLoader(this: LoaderContext<CssEntryLoaderOptions>, source: string) {
    const callback = this.async()

    if (!callback) {
        throw new Error('Uniwind css-entry-loader: async callback is not available')
    }

    this.cacheable(false)
    const options = this.getOptions<CssEntryLoaderOptions>()

    Promise.resolve()
        .then(async () => {
            await injectThemes({
                input: options.cssEntryPath,
                themes: options.themes,
                dtsPath: options.dtsPath,
            })

            return compileVirtual({
                css: source.toString(),
                cssPath: options.cssEntryPath,
                platform: Platform.Web,
                themes: options.themes,
                polyfills: options.polyfills,
                debug: options.debug,
            })
        })
        .then(result => {
            callback(null, result)
        })
        .catch(error => {
            callback(error as Error)
        })
}

export default cssEntryLoader
