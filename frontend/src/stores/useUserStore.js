import { create } from "zustand";
import axiosInstance from "../lib/axios.js";
import { toast } from "react-hot-toast";

export const useUserStore = create((set, get) => ({
  user: null,
  loading: false,
  checkingAuth: true,

  signup: async ({ name, email, password, confirmPassword }) => {
    set({ loading: true });

    if (password !== confirmPassword) {
      set({ loading: false });
      return toast.error("Passwords do not match");
    }

    try {
      const res = await axiosInstance.post("/auth/signup", {
        name,
        email,
        password,
      });
      set({ user: res.data, loading: false });
    } catch (error) {
      set({ loading: false });
      toast.error(error.response.data.message || "An error occurred");
    }
  },
  login: async (email, password) => {
    set({ loading: true });

    try {
      const res = await axiosInstance.post("/auth/login", { email, password });

      set({ user: res.data, loading: false });
      await useCartStore.getState().getCartItems();
    } catch (error) {
      set({ loading: false });
      toast.error(error.response.data.message || "An error occurred");
    }
  },

  logout: async () => {
    try {
      await axiosInstance.post("/auth/logout");
      set({ user: null });
    } catch (error) {
      toast.error(
        error.response?.data?.message || "An error occurred during logout",
      );
    }
  },

  checkAuth: async () => {
    set({ checkingAuth: true });
    try {
      const response = await axiosInstance.get("/auth/profile");
      set({ user: response.data, checkingAuth: false });
    } catch (error) {
      console.log(error.message);
      set({ checkingAuth: false, user: null });
    }
  },

  refreshToken: async () => {
    // Prevent multiple simultaneous refresh attempts
    if (get().checkingAuth) return;

    set({ checkingAuth: true });
    try {
      const response = await axiosInstance.post("/auth/refresh-token");
      set({ checkingAuth: false });
      return response.data;
    } catch (error) {
      set({ user: null, checkingAuth: false });
      throw error;
    }
  },
}));

// TODO: Implement the axios interceptors for refreshing access token

// Axios interceptor for token refresh
let refreshPromise = null;

axiosInstance.interceptors.response.use(
  (response) => response,

  async (error) => {
    const originalRequest = error.config;

    if (!error.response) {
      return Promise.reject(error);
    }

    const status = error.response.status;
    const message = error.response?.data?.message || "";

    if (!message.includes("Access token expired")) {
      return Promise.reject(error);
    }
    const isRefreshRequest = originalRequest.url.includes(
      "/auth/refresh-token",
    );

    const isLoginRequest = originalRequest.url.includes("/auth/login");

    const isProfileRequest = originalRequest.url.includes("/auth/profile");

    // User simply not logged in
    if (message.includes("No access token provided")) {
      return Promise.reject(error);
    }

    if (
      status !== 401 ||
      originalRequest._retry ||
      isRefreshRequest ||
      isLoginRequest ||
      isProfileRequest
    ) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      if (!refreshPromise) {
        refreshPromise = useUserStore.getState().refreshToken();
      }

      await refreshPromise;
      refreshPromise = null;

      return axiosInstance(originalRequest);
    } catch (refreshError) {
      refreshPromise = null;

      useUserStore.setState({
        user: null,
      });

      return Promise.reject(refreshError);
    }
  },
);
