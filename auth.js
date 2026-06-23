(function () {
  const config = window.VECTORLAB_SUPABASE || {};
  const isConfigured = Boolean(
    config.url &&
    config.publishableKey &&
    window.supabase?.createClient
  );
  const client = isConfigured
    ? window.supabase.createClient(config.url, config.publishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      })
    : null;

  const modal = document.getElementById("authModal");
  const feedback = document.getElementById("authFeedback");
  const guestView = document.getElementById("authGuestView");
  const userView = document.getElementById("authUserView");
  const configNotice = document.getElementById("authConfigNotice");
  const openButton = document.getElementById("openAuthBtn");
  const googleButton = document.getElementById("googleLoginBtn");
  const magicLinkForm = document.getElementById("magicLinkForm");
  const loginForm = document.getElementById("loginPanel");
  const registerForm = document.getElementById("registerPanel");
  let currentAuthSession = null;
  let currentProfile = null;

  function setFeedback(message, type = "") {
    feedback.textContent = message;
    feedback.style.color = type === "error" ? "var(--red)" : "var(--green)";
  }

  function setBusy(form, busy) {
    form.querySelectorAll("input, button").forEach((control) => {
      control.disabled = busy;
    });
  }

  function redirectUrl() {
    if (window.location.protocol === "file:") return null;
    return `${window.location.origin}${window.location.pathname}`;
  }

  function openModal() {
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    setFeedback("");
  }

  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = "";
  }

  async function getProfile(user) {
    if (!client || !user) return null;
    const { data, error } = await client
      .from("profiles")
      .select("full_name, role, student_code")
      .eq("id", user.id)
      .maybeSingle();
    if (error) console.warn("No se pudo cargar el perfil.", error);
    return data;
  }

  async function renderSession(session) {
    currentAuthSession = session || null;
    const user = session?.user;
    guestView.hidden = Boolean(user);
    userView.hidden = !user;

    if (!user) {
      currentProfile = null;
      document.getElementById("accountButtonLabel").textContent = "Ingresar";
      document.getElementById("accountButtonDetail").textContent = "Cuenta de estudiante";
      window.dispatchEvent(new CustomEvent("vectorlab:auth-changed", { detail: { session: null } }));
      return;
    }

    const profile = await getProfile(user);
    currentProfile = profile;
    const fullName = profile?.full_name || user.user_metadata?.full_name || "Estudiante";
    const role = profile?.role === "teacher" ? "Docente" : "Alumno";
    document.getElementById("authUserName").textContent = fullName;
    document.getElementById("authUserEmail").textContent = user.email || "";
    document.getElementById("authUserRole").textContent = role;
    document.getElementById("authSyncStatus").textContent = "Cuenta conectada";
    document.getElementById("accountButtonLabel").textContent = fullName;
    document.getElementById("accountButtonDetail").textContent = role;
    window.dispatchEvent(new CustomEvent("vectorlab:auth-changed", {
      detail: { session, profile }
    }));
  }

  document.querySelectorAll("[data-close-auth]").forEach((element) => {
    element.addEventListener("click", closeModal);
  });
  openButton.addEventListener("click", openModal);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeModal();
  });

  document.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".auth-tab").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".auth-form").forEach((form) => form.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(tab.dataset.authPanel).classList.add("active");
      setFeedback("");
    });
  });

  if (!isConfigured) {
    configNotice.hidden = false;
    googleButton.disabled = true;
    magicLinkForm.querySelector("button").disabled = true;
    loginForm.querySelector("button").disabled = true;
    registerForm.querySelector("button").disabled = true;
  }

  googleButton.addEventListener("click", async () => {
    if (!client) return;
    const destination = redirectUrl();
    if (!destination) {
      setFeedback("El acceso con Google requiere abrir VectorLab desde una dirección web.", "error");
      return;
    }
    googleButton.disabled = true;
    setFeedback("Abriendo Google...");
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: destination
      }
    });
    if (error) {
      googleButton.disabled = false;
      setFeedback("No se pudo iniciar el acceso con Google.", "error");
    }
  });

  magicLinkForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!client) return;
    const destination = redirectUrl();
    if (!destination) {
      setFeedback("El enlace por correo requiere abrir VectorLab desde una dirección web.", "error");
      return;
    }
    const values = new FormData(magicLinkForm);
    setBusy(magicLinkForm, true);
    setFeedback("Enviando el enlace...");
    const { error } = await client.auth.signInWithOtp({
      email: String(values.get("email")).trim(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: destination
      }
    });
    setBusy(magicLinkForm, false);
    if (error) {
      setFeedback(error.message || "No se pudo enviar el enlace.", "error");
      return;
    }
    magicLinkForm.reset();
    setFeedback("Te enviamos un enlace. Revisá tu correo para ingresar.");
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!client) return;
    const values = new FormData(loginForm);
    setBusy(loginForm, true);
    setFeedback("Ingresando...");
    const { error } = await client.auth.signInWithPassword({
      email: String(values.get("email")).trim(),
      password: String(values.get("password"))
    });
    setBusy(loginForm, false);
    if (error) {
      setFeedback("No se pudo ingresar. Revisá el correo y la contraseña.", "error");
      return;
    }
    setFeedback("Sesión iniciada.");
  });

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!client) return;
    const values = new FormData(registerForm);
    setBusy(registerForm, true);
    setFeedback("Creando la cuenta...");
    const { data, error } = await client.auth.signUp({
      email: String(values.get("email")).trim(),
      password: String(values.get("password")),
      options: {
        data: {
          full_name: String(values.get("fullName")).trim(),
          student_code: String(values.get("studentCode")).trim()
        }
      }
    });
    setBusy(registerForm, false);
    if (error) {
      setFeedback(error.message || "No se pudo crear la cuenta.", "error");
      return;
    }
    registerForm.reset();
    setFeedback(data.session
      ? "Cuenta creada y sesión iniciada."
      : "Cuenta creada. Revisá tu correo para confirmarla.");
  });

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) {
      setFeedback("No se pudo cerrar la sesión.", "error");
      return;
    }
    setFeedback("Sesión cerrada.");
  });

  if (client) {
    client.auth.getSession().then(({ data }) => renderSession(data.session));
    client.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => renderSession(session), 0);
    });
  } else {
    renderSession(null);
  }

  window.vectorLabAuth = {
    client,
    isConfigured,
    getSession() {
      return currentAuthSession;
    },
    getProfile() {
      return currentProfile;
    }
  };
})();
