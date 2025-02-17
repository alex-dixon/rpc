/**
 * @since 1.0.0
 */
import type { Context, Tag } from "effect/Context"
import type { Effect } from "effect/Effect"
import type { LazyArg } from "effect/Function"
import type { Layer } from "effect/Layer"
import * as internal from "./internal/router"
import type { RpcSchema, RpcService } from "./Schema"
import type { RpcUndecodedClient } from "./Server"

/**
 * @category handler models
 * @since 1.0.0
 */
export type RpcHandler<R, E, I, O> =
  | RpcHandler.IO<R, E, I, O>
  | RpcHandler.IOLayer<R, E, I, O>
  | RpcHandler.NoInput<R, E, O>

/**
 * @since 1.0.0
 */
export namespace RpcHandler {
  /**
   * @category handler models
   * @since 1.0.0
   */
  export type IO<R, E, I, O> = (input: I) => Effect<R, E, O>

  /**
   * @category handler models
   * @since 1.0.0
   */
  export type IOLayer<R, E, I, O> = (input: I) => Layer<R, E, O>

  /**
   * @category handler models
   * @since 1.0.0
   */
  export type NoInput<R, E, O> = Effect<R, E, O>

  /**
   * @category handler models
   * @since 1.0.0
   */
  export type Any = RpcHandler<any, any, any, any>

  /**
   * @category handler utils
   * @since 1.0.0
   */
  export type FromSchema<C extends RpcSchema.Any> = C extends RpcSchema.IO<
    infer _IE,
    infer E,
    infer _II,
    infer I,
    infer _IO,
    infer O
  > ? IO<any, E, I, O>
    : C extends RpcSchema.NoError<infer _II, infer I, infer _IO, infer O> ? IO<any, never, I, O>
    : C extends RpcSchema.NoInput<infer _IE, infer E, infer _IO, infer O> ? NoInput<any, E, O>
    : C extends RpcSchema.NoInputNoError<infer _IO, infer O> ? NoInput<any, never, O>
    : never

  /**
   * @category handler utils
   * @since 1.0.0
   */
  export type FromSetupSchema<C> = C extends RpcSchema.NoOutput<
    infer _IE,
    infer E,
    infer _II,
    infer I
  > ? IO<any, E, I, Context<any>> | IOLayer<any, E, I, any>
    : C extends RpcSchema.NoErrorNoOutput<infer _II, infer I>
      ? IO<any, never, I, Context<any>> | IOLayer<any, never, I, any>
    : never

  /**
   * @category handler utils
   * @since 1.0.0
   */
  export type FromMethod<H extends RpcHandlers, M, XR, E2> = Extract<
    RpcHandlers.Map<H, XR, E2>,
    [M, any]
  > extends [infer _M, infer T] ? T
    : never
}

/**
 * @category handlers models
 * @since 1.0.0
 */
export interface RpcHandlers extends Record<string, RpcHandler.Any | { handlers: RpcHandlers }> {}

/**
 * @since 1.0.0
 */
export namespace RpcHandlers {
  /**
   * @category handlers utils
   * @since 1.0.0
   */
  export type FromService<S extends RpcService.DefinitionWithId> = {
    readonly [
      K in Extract<
        keyof S,
        string
      >
    ]: S[K] extends RpcService.DefinitionWithId ? { handlers: FromService<S[K]> }
      : K extends "__setup" ? RpcHandler.FromSetupSchema<S[K]> :
      S[K] extends RpcSchema.Any ? RpcHandler.FromSchema<S[K]>
      : never
  }

  /**
   * @category handlers utils
   * @since 1.0.0
   */
  export type Services<H extends RpcHandlers> = {
    [M in keyof H]: H[M] extends { readonly handlers: RpcHandlers } ? Services<H[M]["handlers"]>
      : H[M] extends RpcHandler<infer R, infer _E, infer _I, infer _O> ? R
      : never
  }[keyof H]

  /**
   * @category handlers utils
   * @since 1.0.0
   */
  export type Error<H extends RpcHandlers> = {
    [M in keyof H]: H[M] extends { readonly handlers: RpcHandlers } ? Services<H[M]["handlers"]>
      : H[M] extends RpcHandler<infer _R, infer E, infer _I, infer _O> ? E
      : never
  }[keyof H]

  /**
   * @category handlers utils
   * @since 1.0.0
   */
  export type Map<H extends RpcHandlers, XR, E2, P extends string = ""> = {
    readonly [K in keyof H]: K extends string
      ? H[K] extends { handlers: RpcHandlers } ? Map<H[K]["handlers"], XR, E2, `${P}${K}.`>
      : H[K] extends RpcHandler.IO<infer R, infer E, infer _I, infer O>
        ? [`${P}${K}`, Effect<Exclude<R, XR>, E | E2, O>]
      : H[K] extends Effect<infer R, infer E, infer O> ? [`${P}${K}`, Effect<Exclude<R, XR>, E | E2, O>]
      : never
      : never
  }[keyof H]
}

/**
 * @category router models
 * @since 1.0.0
 */
export interface RpcRouter<
  S extends RpcService.DefinitionWithId,
  H extends RpcHandlers
> extends RpcRouter.Base {
  readonly handlers: H
  readonly schema: S
  readonly undecoded: RpcUndecodedClient<H>
}

/**
 * @since 1.0.0
 */
export namespace RpcRouter {
  /**
   * @category router models
   * @since 1.0.0
   */
  export interface Base {
    readonly handlers: RpcHandlers
    readonly schema: RpcService.DefinitionWithId
    readonly undecoded: RpcUndecodedClient<RpcHandlers>
    readonly options: Options
  }

  /**
   * @category router models
   * @since 1.0.0
   */
  export interface WithSetup extends Base {
    readonly handlers: RpcHandlers & {
      readonly __setup: RpcHandler.Any
    }
  }

  /**
   * @category router models
   * @since 1.0.0
   */
  export interface WithoutSetup extends Base {
    readonly handlers: RpcHandlers & {
      readonly __setup?: never
    }
  }

  /**
   * @category router models
   * @since 1.0.0
   */
  export interface Options {
    readonly spanPrefix: string
  }

  /**
   * @category router utils
   * @since 1.0.0
   */
  export type Provide<Router extends Base, XR, PR, PE> = RpcRouter<
    Router["schema"],
    {
      readonly [M in keyof Router["handlers"]]: Router["handlers"][M] extends Base
        ? Provide<Router["handlers"][M], XR, PR, PE>
        : Router["handlers"][M] extends RpcHandler.IO<
          infer R,
          infer E,
          infer I,
          infer O
        > ? RpcHandler.IO<Exclude<R, XR> | PR, E | PE, I, O>
        : Router["handlers"][M] extends RpcHandler.IOLayer<
          infer R,
          infer E,
          infer I,
          infer O
        > ? RpcHandler.IOLayer<Exclude<R, XR> | PR, E | PE, I, O>
        : Router["handlers"][M] extends RpcHandler.NoInput<
          infer R,
          infer E,
          infer O
        > ? RpcHandler.NoInput<Exclude<R, XR> | PR, E | PE, O>
        : never
    }
  >

  /**
   * @category router utils
   * @since 1.0.0
   */
  export type SetupServices<R extends WithSetup> = R["handlers"]["__setup"] extends RpcHandler.IOLayer<
    infer _R,
    infer _E,
    infer _I,
    infer O
  > ? O
    : R["handlers"]["__setup"] extends RpcHandler.IO<
      infer _R,
      infer _E,
      infer _I,
      infer O
    > ? O extends Context<infer Env> ? Env
      : never
    : never
}

/**
 * @category router constructors
 * @since 1.0.0
 */
export const make: <
  S extends RpcService.DefinitionWithId,
  H extends RpcHandlers.FromService<S>
>(
  schema: S,
  handlers: H,
  options?: Partial<RpcRouter.Options>
) => RpcRouter<S, H> = internal.make

/**
 * @category router combinators
 * @since 1.0.0
 */
export const provideService: {
  <T extends Tag<any, any>>(
    tag: T,
    service: Tag.Service<T>
  ): <Router extends RpcRouter.Base>(
    self: Router
  ) => RpcRouter.Provide<Router, Tag.Identifier<T>, never, never>
  <Router extends RpcRouter.Base, T extends Tag<any, any>>(
    self: Router,
    tag: T,
    service: Tag.Service<T>
  ): RpcRouter.Provide<Router, Tag.Identifier<T>, never, never>
} = internal.provideService

/**
 * @category router combinators
 * @since 1.0.0
 */
export const provideServiceEffect: {
  <
    Router extends RpcRouter.Base,
    T extends Tag<any, any>,
    R,
    E extends RpcService.Errors<Router["schema"]>
  >(
    tag: T,
    effect: Effect<R, E, Tag.Service<T>>
  ): (self: Router) => RpcRouter.Provide<Router, Tag.Identifier<T>, R, E>
  <
    Router extends RpcRouter.Base,
    T extends Tag<any, any>,
    R,
    E extends RpcService.Errors<Router["schema"]>
  >(
    self: Router,
    tag: T,
    effect: Effect<R, E, Tag.Service<T>>
  ): RpcRouter.Provide<Router, Tag.Identifier<T>, R, E>
} = internal.provideServiceEffect

/**
 * @category router combinators
 * @since 1.0.0
 */
export const provideServiceSync: {
  <T extends Tag<any, any>>(
    tag: T,
    service: LazyArg<Tag.Service<T>>
  ): <Router extends RpcRouter.Base>(
    self: Router
  ) => RpcRouter.Provide<Router, Tag.Identifier<T>, never, never>
  <Router extends RpcRouter.Base, T extends Tag<any, any>>(
    self: Router,
    tag: T,
    service: LazyArg<Tag.Service<T>>
  ): RpcRouter.Provide<Router, Tag.Identifier<T>, never, never>
} = internal.provideServiceSync
