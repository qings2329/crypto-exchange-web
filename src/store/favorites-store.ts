// 自选（收藏）交易对：Zustand + persist 中间件持久化到 LocalStorage。
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface FavoritesState {
  favorites: string[];
  toggle: (symbol: string) => void;
  isFavorite: (symbol: string) => boolean;
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      favorites: [],
      toggle: (symbol) =>
        set((st) => ({
          favorites: st.favorites.includes(symbol)
            ? st.favorites.filter((s) => s !== symbol)
            : [...st.favorites, symbol],
        })),
      isFavorite: (symbol) => get().favorites.includes(symbol),
    }),
    { name: "cx_favorites" }
  )
);
