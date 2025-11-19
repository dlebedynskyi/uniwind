import type { LoaderContext, LoaderDefinitionFunction } from 'webpack'
import { injectThemes } from '../metro/injectThemes'

type InjectedLoaderOptions = {
    cssEntryPath: string
    dtsPath?: string
    themes: Array<string>
}

const injectedLoader: LoaderDefinitionFunction<InjectedLoaderOptions> = function injectedLoader(this: LoaderContext<InjectedLoaderOptions>) {
    const callback = this.async()

    if (!callback) {
        throw new Error('Uniwind injected-loader: async callback is not available')
    }

    this.cacheable(false)
    const options = this.getOptions<InjectedLoaderOptions>()

    injectThemes({
        input: options.cssEntryPath,
        themes: options.themes,
        dtsPath: options.dtsPath,
    })
        .then(code => {
            callback(null, code)
        })
        .catch(error => {
            callback(error as Error)
        })
}

export default injectedLoader
