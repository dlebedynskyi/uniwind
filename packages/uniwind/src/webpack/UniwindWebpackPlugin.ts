import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import type { Compiler, NormalModuleFactory, RuleSetRule } from 'webpack'
import { SUPPORTED_COMPONENTS, type SupportedComponentName } from '../components/supportedComponents'
import { uniq } from '../metro/utils'
import type { Polyfills } from '../metro/types'
import { name } from '../../package.json'

const PLUGIN_NAME = 'UniwindWebpackPlugin'
const COMPONENT_SET: Set<string> = new Set(SUPPORTED_COMPONENTS)

const getCurrentDirname = () =>
    typeof __dirname !== 'undefined'
        ? __dirname
        : path.dirname(fileURLToPath(import.meta.url))

const findPackageRoot = () => {
    let dir = getCurrentDirname()

    while (true) {
        const pkgPath = path.join(dir, 'package.json')

        if (fs.existsSync(pkgPath)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))

                if (pkg.name === name) {
                    return dir
                }
            } catch {
                // continue
            }
        }

        const parent = path.dirname(dir)

        if (parent === dir) {
            return dir
        }

        dir = parent
    }
}

const normalizePath = (value: string) => path.normalize(value)

const stripLoaders = (request: string) => {
    const lastBangIndex = request.lastIndexOf('!')

    return lastBangIndex >= 0
        ? request.slice(lastBangIndex + 1)
        : request
}

const splitQuery = (request: string) => {
    const [pathName, query] = request.split('?')

    return { pathName: pathName ?? '', query: query ? `?${query}` : '' }
}

const isSupportedComponent = (component: string | undefined): component is SupportedComponentName =>
    component !== undefined && COMPONENT_SET.has(component)

type ComponentMatch = {
    component: string
    request: string
}

const matchReactNativeComponent = (request: string): ComponentMatch | null => {
    const normalized = request.replace(/\\/g, '/').replace(/^\.\//, '')

    if (!normalized.startsWith('react-native')) {
        return null
    }

    if (normalized === 'react-native') {
        return {
            component: '',
            request: `${name}/components`,
        }
    }

    if (!normalized.startsWith('react-native/Libraries/')) {
        return null
    }

    const segments = normalized.split('/')
    const lastSegment = segments.at(-1) ?? ''
    const isIndexFile = lastSegment === 'index' || lastSegment.startsWith('index.')
    const candidate = isIndexFile
        ? segments.at(-2)
        : lastSegment
    const component = candidate?.split('.').at(0)

    if (isSupportedComponent(component)) {
        return {
            component,
            request: `${name}/components/${component}`,
        }
    }

    return null
}

const matchReactNativeWebComponent = (request: string): ComponentMatch | null => {
    const normalized = request.replace(/\\/g, '/').replace(/^\.\//, '')

    if (!normalized.startsWith('react-native-web/dist')) {
        return null
    }

    const segments = normalized.split('/')
    const lastSegment = segments.at(-1) ?? ''
    const isIndexFile = lastSegment === 'index' || lastSegment.startsWith('index.')
    const candidate = isIndexFile
        ? segments.at(-2)
        : lastSegment
    const component = candidate?.split('.').at(0)

    if (isSupportedComponent(component)) {
        return {
            component,
            request: `${name}/components/${component}`,
        }
    }

    return null
}

const getLoaderAbsolutePath = (file: string) => {
    const dirname = getCurrentDirname()

    return path.join(dirname, file)
}

const resolveInjectedTargets = (packageRoot: string) => {
    const targets = [
        path.join(packageRoot, 'src/components/web/metro-injected.ts'),
        path.join(packageRoot, 'dist/common/components/web/metro-injected.js'),
        path.join(packageRoot, 'dist/module/components/web/metro-injected.js'),
    ]

    return new Set(targets.map(normalizePath))
}

export type UniwindWebpackPluginOptions = {
    cssEntryFile: string
    extraThemes?: Array<string>
    dtsFile?: string
    polyfills?: Polyfills
    debug?: boolean
}

type ResolvedOptions = {
    cssEntryPath: string
    dtsPath?: string
    themes: Array<string>
    polyfills?: Polyfills
    debug?: boolean
}

export class UniwindWebpackPlugin {
    private readonly packageRoot = findPackageRoot()
    private readonly moduleRoot = normalizePath(this.packageRoot)
    private readonly injectedTargets = resolveInjectedTargets(this.packageRoot)

    constructor(private readonly options: UniwindWebpackPluginOptions) {}

    apply(compiler: Compiler) {
        if (!this.options || typeof this.options.cssEntryFile !== 'string') {
            throw new Error('Uniwind: You need to pass css entry file to UniwindWebpackPlugin')
        }

        const resolvedOptions = this.resolveOptions(compiler)

        this.ensureCssExtension(compiler)
        this.injectCssRule(compiler, resolvedOptions)
        this.injectThemesRule(compiler, resolvedOptions)
        this.patchResolver(compiler)
    }

    private resolveOptions(compiler: Compiler): ResolvedOptions {
        const cssEntryPath = normalizePath(path.resolve(compiler.context, this.options.cssEntryFile))
        const dtsPath = this.options.dtsFile
            ? normalizePath(path.resolve(compiler.context, this.options.dtsFile))
            : undefined
        const themes = uniq([
            'light',
            'dark',
            ...(this.options.extraThemes ?? []),
        ])

        return {
            cssEntryPath,
            dtsPath,
            themes,
            polyfills: this.options.polyfills,
            debug: this.options.debug,
        }
    }

    private ensureCssExtension(compiler: Compiler) {
        compiler.options.resolve ??= {}
        compiler.options.resolve.extensions ??= ['.js', '.json']

        if (!compiler.options.resolve.extensions.includes('.css')) {
            compiler.options.resolve.extensions.push('.css')
        }
    }

    private injectCssRule(compiler: Compiler, options: ResolvedOptions) {
        compiler.options.module ??= {}
        compiler.options.module.rules ??= []

        const rule: RuleSetRule = {
            enforce: 'pre',
            test: (resource: string) => normalizePath(resource) === options.cssEntryPath,
            type: 'javascript/auto',
            use: [
                {
                    loader: getLoaderAbsolutePath('css-entry-loader.cjs'),
                    options,
                },
            ],
        }

        compiler.options.module.rules = [rule, ...compiler.options.module.rules]
    }

    private injectThemesRule(compiler: Compiler, options: ResolvedOptions) {
        compiler.options.module ??= {}
        compiler.options.module.rules ??= []

        const rule: RuleSetRule = {
            test: (resource: string) => this.injectedTargets.has(normalizePath(resource)),
            type: 'javascript/auto',
            use: [
                {
                    loader: getLoaderAbsolutePath('injected-loader.cjs'),
                    options,
                },
            ],
        }

        compiler.options.module.rules = [rule, ...compiler.options.module.rules]
    }

    private patchResolver(compiler: Compiler) {
        compiler.hooks.normalModuleFactory.tap(PLUGIN_NAME, (factory: NormalModuleFactory) => {
            factory.hooks.beforeResolve.tap(PLUGIN_NAME, (data: any) => {
                if (!data) {
                    return
                }

                const issuer = data.contextInfo?.issuer

                if (issuer && this.isIssuerFromThisModule(issuer)) {
                    return
                }

                if (!data.request) {
                    return
                }

                const prefixLength = data.request.lastIndexOf('!') + 1
                const prefix = prefixLength > 0
                    ? data.request.slice(0, prefixLength)
                    : ''
                const requestWithoutLoaders = stripLoaders(data.request)
                const { pathName, query } = splitQuery(requestWithoutLoaders)
                const rnMatch = matchReactNativeComponent(pathName)

                if (rnMatch) {
                    data.request = `${prefix}${rnMatch.request}${query}`

                    return
                }

                const rnwMatch = matchReactNativeWebComponent(pathName)

                if (rnwMatch) {
                    data.request = `${prefix}${rnwMatch.request}${query}`
                }
            })
        })
    }

    private isIssuerFromThisModule(issuer: string) {
        const normalizedIssuer = normalizePath(issuer)

        return normalizedIssuer === this.moduleRoot || normalizedIssuer.startsWith(`${this.moduleRoot}${path.sep}`)
    }
}
