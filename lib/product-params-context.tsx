"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ProductParams, ProductType } from "./persona-scores";

type Ctx = {
  type: ProductType;
  paramValue: number;
  setType: (t: ProductType) => void;
  setParamValue: (v: number) => void;
  buildParams: () => ProductParams;
};

const ProductParamsContext = createContext<Ctx | null>(null);

const TYPE_DEFAULTS: Record<ProductType, number> = {
  loan: 6.88,
  insurance: 199,
  creditcard: 5,
};

export function ProductParamsProvider({ children }: { children: ReactNode }) {
  const [type, setTypeRaw] = useState<ProductType>("loan");
  const [paramValue, setParamValue] = useState(TYPE_DEFAULTS.loan);

  // useCallback 確保函式 reference 穩定 — 避免下游 useEffect 因依賴變化而 re-fire
  const setType = useCallback((next: ProductType) => {
    setTypeRaw((current) => {
      // 只在類型確實切換時才 reset 滑桿值；避免相同類型重設
      if (current !== next) {
        setParamValue(TYPE_DEFAULTS[next]);
      }
      return next;
    });
  }, []);

  const buildParams = useCallback((): ProductParams => {
    if (type === "loan") return { type: "loan", interestRate: paramValue };
    if (type === "insurance")
      return { type: "insurance", monthlyFee: paramValue };
    return { type: "creditcard", cashbackRate: paramValue };
  }, [type, paramValue]);

  // 把 context value memoize，避免每次 render 都製造新物件導致 consumers 全部重 render
  const value = useMemo(
    () => ({ type, paramValue, setType, setParamValue, buildParams }),
    [type, paramValue, setType, buildParams]
  );

  return (
    <ProductParamsContext.Provider value={value}>
      {children}
    </ProductParamsContext.Provider>
  );
}

export function useProductParams(): Ctx {
  const v = useContext(ProductParamsContext);
  if (!v) {
    throw new Error(
      "useProductParams 必須在 <ProductParamsProvider> 內使用"
    );
  }
  return v;
}
