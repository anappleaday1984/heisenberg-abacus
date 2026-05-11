"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { resolveOpenSliderConfig } from "./abacus-config";
import type { ProductParams, ProductType } from "./persona-scores";
import { DEFAULT_SHOCKS, type ShockState } from "./persona-projections";

type Ctx = {
  type: ProductType;
  paramValue: number;
  isOpen: boolean;
  openContext: string;
  // 共用外部衝擊 — 通膨 / 失業 / 疫情。所有面板都從這裡讀,
  // 確保「臨界點」隨同一份 shocks 一致移動。
  shocks: ShockState;
  setType: (t: ProductType) => void;
  setParamValue: (v: number) => void;
  setIsOpen: (open: boolean, context?: string) => void;
  setOpenContext: (context: string) => void;
  setShocks: (s: ShockState | ((prev: ShockState) => ShockState)) => void;
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
  const [isOpen, setIsOpenRaw] = useState(false);
  const [openContext, setOpenContextRaw] = useState("");
  const [paramValue, setParamValue] = useState(TYPE_DEFAULTS.loan);
  const [shocks, setShocksRaw] = useState<ShockState>(DEFAULT_SHOCKS);
  const setShocks = useCallback(
    (s: ShockState | ((prev: ShockState) => ShockState)) => {
      setShocksRaw((prev) => (typeof s === "function" ? s(prev) : s));
    },
    []
  );

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

  const setIsOpen = useCallback((next: boolean, context = "") => {
    setIsOpenRaw((wasOpen) => {
      // 進入開放模式 → 依語境決定算盤珠的 default 值
      if (!wasOpen && next) {
        const cfg = resolveOpenSliderConfig(context);
        setParamValue(cfg.default);
        setOpenContextRaw(context);
      }
      return next;
    });
  }, []);

  const setOpenContext = useCallback((context: string) => {
    setOpenContextRaw((prev) => {
      // 已在開放模式但語境換了 → 重設算盤珠到新類別的 default
      if (prev !== context) {
        const cfg = resolveOpenSliderConfig(context);
        setParamValue(cfg.default);
      }
      return context;
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
    () => ({
      type,
      paramValue,
      isOpen,
      openContext,
      shocks,
      setType,
      setParamValue,
      setIsOpen,
      setOpenContext,
      setShocks,
      buildParams,
    }),
    [
      type,
      paramValue,
      isOpen,
      openContext,
      shocks,
      setType,
      setIsOpen,
      setOpenContext,
      setShocks,
      buildParams,
    ]
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
