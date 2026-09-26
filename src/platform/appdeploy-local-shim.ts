type Response<T = unknown> = { data: T };

const unavailable = () => {
  throw new Error('Nightjar runtime services are not connected in this local/Firebase build. Use the configured AppDeploy runtime for account and backend operations.');
};

export const api = {
  get: <T = unknown>(_path: string): Promise<Response<T>> => Promise.reject(unavailable()),
  post: <T = unknown>(_path: string, _body?: unknown): Promise<Response<T>> => Promise.reject(unavailable()),
  put: <T = unknown>(_path: string, _body?: unknown): Promise<Response<T>> => Promise.reject(unavailable()),
};

export const auth = {
  isSignedIn: (): boolean => false,
  getUser: async (): Promise<null> => null,
  signIn: async (): Promise<never> => unavailable(),
  signOut: async (): Promise<void> => undefined,
};