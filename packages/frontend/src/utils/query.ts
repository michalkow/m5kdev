class QueryCache {
  update =
    <T extends Record<K, any>, A extends string | null = null, K extends string = "id">(
      element: T | T[],
      accessor: A = null as A,
      key: K = "id" as K
    ) =>
    <D>(data: D): D => {
      if (!data) return data;
      const target = accessor ? (data as any)[accessor] : (data as T[]);
      if (!Array.isArray(target)) return data;
      const modified = target.map((item: T) => {
        const isMatch = Array.isArray(element)
          ? element.findIndex((el) => el[key] === item[key]) > -1
          : element[key] === item[key];
        return isMatch
          ? {
              ...item,
              ...(Array.isArray(element) ? element.find((el) => el[key] === item[key]) : element),
            }
          : item;
      });

      return accessor ? ({ ...data, [accessor]: modified } as D) : (modified as unknown as D);
    };

  delete =
    <
      T extends Record<K, any>,
      D extends (A extends string ? { [key in A]: T[] } : T[]) | undefined,
      A extends string | null = null,
      K extends string = "id",
    >(
      element: T | T[],
      accessor: A = null as A,
      key: K = "id" as K
    ) =>
    <OriginalD extends D>(data: OriginalD): OriginalD => {
      if (!data) return data;
      const target = (accessor ? (data as any)[accessor] : data) as T[] | undefined;
      if (!Array.isArray(target)) return data;
      const modified = target.filter((item) =>
        Array.isArray(element)
          ? element.findIndex((el) => el[key] === item[key]) === -1
          : item[key] !== element[key]
      );
      return accessor
        ? ({ ...data, [accessor]: modified } as OriginalD)
        : (modified as unknown as OriginalD);
    };

  create =
    <
      T extends Record<string, any>,
      D extends (A extends string ? { [key in A]: T[] } : T[]) | undefined,
      A extends string | null = null,
    >(
      element: T | T[],
      accessor: A = null as A
    ) =>
    <OriginalD extends D>(data: OriginalD): OriginalD => {
      if (!data) return data;
      const target = (accessor ? (data as any)[accessor] : data) as T[] | undefined;
      if (!target) return data;
      const modified = [...target, ...(Array.isArray(element) ? element : [element])];
      return accessor
        ? ({ ...data, [accessor]: modified } as OriginalD)
        : (modified as unknown as OriginalD);
    };
}

export const queryCache = new QueryCache();
