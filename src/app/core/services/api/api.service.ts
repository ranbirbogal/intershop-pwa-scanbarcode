import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Store, select } from '@ngrx/store';
import {
  MonoTypeOperatorFunction,
  Observable,
  OperatorFunction,
  Subject,
  combineLatest,
  forkJoin,
  iif,
  of,
  throwError,
} from 'rxjs';
import { catchError, concatMap, first, map, switchMap, tap, withLatestFrom } from 'rxjs/operators';

import { Captcha } from 'ish-core/models/captcha/captcha.model';
import { Link } from 'ish-core/models/link/link.model';
import { getCurrentLocale, getICMServerURL, getRestEndpoint } from 'ish-core/store/core/configuration';
import { getAPIToken, getPGID } from 'ish-core/store/customer/user';

import { ApiServiceErrorHandler } from './api.service.errorhandler';

/**
 * Pipeable operator for elements translation (removing the envelop).
 * @param key the name of the envelope (default 'elements')
 * @returns The items of an elements array without the elements wrapper.
 */
export function unpackEnvelope<T>(key: string = 'elements'): OperatorFunction<{}, T[]> {
  return map(data => (!!data && !!data[key] && !!data[key].length ? data[key] : []));
}

/**
 * Pipable operator for link translation (resolving one single link).
 * @param apiService  The API service to be used for the link translation.
 * @returns           The link resolved to its actual REST response data.
 */
export function resolveLink<T>(apiService: ApiService): OperatorFunction<Link, T> {
  return switchMap(link =>
    iif(
      // check if link data is properly formatted
      () => !!link && link.type === 'Link' && !!link.uri,
      // flat map to API request
      apiService.get<T>(`${apiService.icmServerURL}/${link.uri}`),
      // throw if link is not properly supplied
      throwError(new Error('link was not properly formatted'))
    )
  );
}

/**
 * Pipable operator for link translation (resolving the links).
 * @param apiService  The API service to be used for the link translation.
 * @returns           The links resolved to their actual REST response data.
 */
export function resolveLinks<T>(apiService: ApiService): OperatorFunction<Link[], T[]> {
  return source$ =>
    source$.pipe(
      // filter for all real Link elements
      map(links => links.filter(el => !!el && el.type === 'Link' && !!el.uri)),
      // transform Link elements to API Observables
      map(links => links.map(item => apiService.get<T>(`${apiService.icmServerURL}/${item.uri}`))),
      // flatten to API requests O<O<T>[]> -> O<T[]>
      switchMap(obsArray => iif(() => !!obsArray.length, forkJoin(obsArray), of([])))
    );
}

function catchApiError<T>(handler: ApiServiceErrorHandler) {
  return (source$: Observable<T>) =>
    // tslint:disable-next-line:ban
    source$.pipe(catchError(error => handler.dispatchCommunicationErrors<T>(error)));
}

export interface AvailableOptions {
  params?: HttpParams;
  headers?: HttpHeaders;
  skipApiErrorHandling?: boolean;
  runExclusively?: boolean;
  captcha?: Captcha;
  sendPGID?: boolean;
  sendSPGID?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  static TOKEN_HEADER_KEY = 'authentication-token';
  static AUTHORIZATION_HEADER_KEY = 'Authorization';

  icmServerURL: string;

  private executionBarrier$: Observable<void> | Subject<void> = of(undefined);

  constructor(
    private httpClient: HttpClient,
    private apiServiceErrorHandler: ApiServiceErrorHandler,
    private store: Store
  ) {
    store.pipe(select(getICMServerURL)).subscribe(url => (this.icmServerURL = url));
  }

  /**
   * appends API token to requests if available and request is not an authorization request
   */
  private appendAPITokenToHeaders(): MonoTypeOperatorFunction<HttpHeaders> {
    return headers$ =>
      headers$.pipe(
        withLatestFrom(this.store.pipe(select(getAPIToken))),
        map(([headers, apiToken]) =>
          apiToken && !headers.has(ApiService.AUTHORIZATION_HEADER_KEY)
            ? headers.set(ApiService.TOKEN_HEADER_KEY, apiToken)
            : headers
        )
      );
  }

  /**
-  * sets the request header for the appropriate captcha service
-  * @param captcha captcha token for captcha V2 and V3
-  * @param captchaAction captcha action for captcha V3
-  */
  private appendCaptchaTokenToHeaders(captcha: string, captchaAction: string): MonoTypeOperatorFunction<HttpHeaders> {
    return map(headers =>
      // testing token gets 'null' from captcha service, so we accept it as a valid value here
      captchaAction !== undefined
        ? // captcha V3
          headers.set(ApiService.AUTHORIZATION_HEADER_KEY, `CAPTCHA recaptcha_token=${captcha} action=${captchaAction}`)
        : // captcha V2
          // TODO: remove second parameter 'foo=bar' that currently only resolves a shortcoming of the server side implementation that still requires two parameters
          headers.set(ApiService.AUTHORIZATION_HEADER_KEY, `CAPTCHA g-recaptcha-response=${captcha} foo=bar`)
    );
  }

  /**
   * merges supplied and default headers
   */
  private constructHeaders(options?: AvailableOptions): Observable<HttpHeaders> {
    const defaultHeaders = new HttpHeaders().set('content-type', 'application/json').set('Accept', 'application/json');

    return of(
      options?.headers
        ? // append incoming headers to default ones
          options.headers.keys().reduce((acc, key) => acc.set(key, options.headers.get(key)), defaultHeaders)
        : // just use default headers
          defaultHeaders
    ).pipe(
      // testing token gets 'null' from captcha service, so we accept it as a valid value here
      options?.captcha?.captcha !== undefined
        ? // captcha headers
          this.appendCaptchaTokenToHeaders(options.captcha.captcha, options.captcha.captchaAction)
        : // default to api token
          this.appendAPITokenToHeaders()
    );
  }

  private execute<T>(options: AvailableOptions, httpCall$: Observable<T>): Observable<T> {
    const wrappedCall$ = options?.skipApiErrorHandling
      ? httpCall$
      : httpCall$.pipe(catchApiError(this.apiServiceErrorHandler));

    if (options?.runExclusively) {
      // setup a barrier for other calls
      const subject$ = new Subject<void>();
      this.executionBarrier$ = subject$;
      const releaseBarrier = () => {
        subject$.next();
        this.executionBarrier$ = of(undefined);
      };

      // release barrier on completion
      return wrappedCall$.pipe(
        tap(releaseBarrier),
        // tslint:disable-next-line:ban
        catchError(err => {
          releaseBarrier();
          return throwError(err);
        })
      );
    } else {
      // respect barrier
      return this.executionBarrier$.pipe(concatMap(() => wrappedCall$));
    }
  }

  private constructUrlForPath(path: string, options?: AvailableOptions): Observable<string> {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return of(path);
    }
    return combineLatest([
      // base url
      this.store.pipe(select(getRestEndpoint)),
      // locale and currency
      this.store.pipe(
        select(getCurrentLocale),
        map(l => (l ? `;loc=${l.lang};cur=${l.currency}` : ''))
      ),
      // first path segment
      of('/'),
      of(path.includes('/') ? path.split('/')[0] : path),
      // pgid
      this.store.pipe(
        select(getPGID),
        map(pgid => (options?.sendPGID && pgid ? `;pgid=${pgid}` : options?.sendSPGID ? `;spgid=${pgid}` : ''))
      ),
      // remaining path
      of(path.includes('/') ? path.substr(path.indexOf('/')) : ''),
    ]).pipe(
      first(),
      map(arr => arr.join(''))
    );
  }

  private constructHttpClientParams(
    path: string,
    options?: AvailableOptions
  ): Observable<[string, { headers: HttpHeaders; params: HttpParams }]> {
    return forkJoin([
      this.constructUrlForPath(path, options),
      this.constructHeaders(options).pipe(
        map(headers => ({
          params: options?.params,
          headers,
        }))
      ),
    ]);
  }

  /**
   * http get request
   */
  get<T>(path: string, options?: AvailableOptions): Observable<T> {
    return this.execute(
      options,
      this.constructHttpClientParams(path, options).pipe(
        concatMap(([url, httpOptions]) => this.httpClient.get<T>(url, httpOptions))
      )
    );
  }

  /**
   * http options request
   */
  options<T>(path: string, options?: AvailableOptions): Observable<T> {
    return this.execute(
      options,
      this.constructHttpClientParams(path, options).pipe(
        concatMap(([url, httpOptions]) => this.httpClient.options<T>(url, httpOptions))
      )
    );
  }

  /**
   * http put request
   */
  put<T>(path: string, body = {}, options?: AvailableOptions): Observable<T> {
    return this.execute(
      options,
      this.constructHttpClientParams(path, options).pipe(
        concatMap(([url, httpOptions]) => this.httpClient.put<T>(url, body, httpOptions))
      )
    );
  }

  /**
   * http patch request
   */
  patch<T>(path: string, body = {}, options?: AvailableOptions): Observable<T> {
    return this.execute(
      options,
      this.constructHttpClientParams(path, options).pipe(
        concatMap(([url, httpOptions]) => this.httpClient.patch<T>(url, body, httpOptions))
      )
    );
  }

  /**
   * http post request
   */
  post<T>(path: string, body = {}, options?: AvailableOptions): Observable<T> {
    return this.execute(
      options,
      this.constructHttpClientParams(path, options).pipe(
        concatMap(([url, httpOptions]) => this.httpClient.post<T>(url, body, httpOptions))
      )
    );
  }

  /**
   * http delete request
   */
  delete<T>(path: string, options?: AvailableOptions): Observable<T> {
    return this.execute(
      options,
      this.constructHttpClientParams(path, options).pipe(
        concatMap(([url, httpOptions]) => this.httpClient.delete<T>(url, httpOptions))
      )
    );
  }
}
