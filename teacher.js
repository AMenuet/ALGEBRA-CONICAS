(function () {
  const client = window.vectorLabAuth?.client;
  const teacherTab = document.getElementById("teacherTab");
  const courseList = document.getElementById("teacherCourses");
  const emptyState = document.getElementById("teacherEmptyState");
  const courseView = document.getElementById("teacherCourseView");
  const feedback = document.getElementById("teacherFeedback");
  let teacherUser = null;
  let courses = [];
  let selectedCourse = null;

  function setFeedback(message, error = false) {
    feedback.textContent = message;
    feedback.style.color = error ? "var(--red)" : "var(--green)";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatTime(seconds) {
    const total = Number(seconds) || 0;
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    return hours ? `${hours} h ${minutes} min` : `${minutes} min`;
  }

  function formatDate(value) {
    return value ? new Date(value).toLocaleDateString("es-AR") : "—";
  }

  function showTeacherAccess(profile, session) {
    const isTeacher = profile?.role === "teacher" || profile?.role === "admin";
    teacherTab.hidden = !isTeacher;
    teacherUser = isTeacher ? session?.user : null;
    if (!isTeacher) {
      if (document.getElementById("sec-teacher").classList.contains("active")) {
        document.querySelector('[data-section="sec-vectores"]').click();
      }
      return;
    }
    loadCourses();
  }

  async function loadCourses() {
    if (!client || !teacherUser) return;
    setFeedback("Cargando cursos...");
    const { data, error } = await client
      .from("courses")
      .select("id, name, code, academic_year, active, created_at")
      .eq("teacher_id", teacherUser.id)
      .order("created_at", { ascending: false });
    if (error) {
      setFeedback("No se pudieron cargar los cursos. Verificá la actualización SQL.", true);
      return;
    }
    courses = data || [];
    renderCourses();
    setFeedback("");
    if (selectedCourse) {
      const refreshed = courses.find((course) => course.id === selectedCourse.id);
      if (refreshed) selectCourse(refreshed);
    }
  }

  function renderCourses() {
    courseList.innerHTML = courses.length
      ? courses.map((course) => `
          <button class="teacher-course-btn ${selectedCourse?.id === course.id ? "active" : ""}"
                  type="button" data-course-id="${course.id}">
            <strong>${escapeHtml(course.name)}</strong>
            <small>${escapeHtml(course.code)} · ${course.academic_year || "Sin año"}</small>
          </button>
        `).join("")
      : '<p class="muted">Todavía no hay cursos.</p>';
    courseList.querySelectorAll("[data-course-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const course = courses.find((item) => item.id === button.dataset.courseId);
        if (course) selectCourse(course);
      });
    });
  }

  async function selectCourse(course) {
    selectedCourse = course;
    renderCourses();
    emptyState.hidden = true;
    courseView.hidden = false;
    document.getElementById("teacherCourseCode").textContent = course.code;
    document.getElementById("teacherCourseName").textContent = course.name;
    await loadDashboard();
  }

  async function loadDashboard() {
    if (!selectedCourse) return;
    setFeedback("Actualizando indicadores...");
    const { data, error } = await client.rpc("teacher_course_dashboard", {
      target_course: selectedCourse.id
    });
    if (error) {
      setFeedback("No se pudieron obtener los indicadores del curso.", true);
      return;
    }
    renderDashboard(Array.isArray(data) ? data : []);
    setFeedback("");
  }

  function renderDashboard(students) {
    const totalCompleted = students.reduce((sum, student) => sum + Number(student.completed_count || 0), 0);
    const totalAttempted = students.reduce((sum, student) => sum + Number(student.attempted_count || 0), 0);
    const totalCorrectAttempts = students.reduce((sum, student) => sum + Number(student.correct_attempts || 0), 0);
    const totalAttempts = students.reduce((sum, student) => sum + Number(student.attempts || 0), 0);
    const totalSeconds = students.reduce((sum, student) => sum + Number(student.active_seconds || 0), 0);
    const progressAverage = students.length
      ? Math.round(students.reduce((sum, student) => sum + Number(student.progress_percent || 0), 0) / students.length)
      : 0;
    const accuracy = totalAttempts ? Math.round(totalCorrectAttempts / totalAttempts * 100) : 0;

    document.getElementById("teacherStudentCount").textContent = students.length;
    document.getElementById("teacherAverageProgress").textContent = `${progressAverage}%`;
    document.getElementById("teacherAverageAccuracy").textContent = `${accuracy}%`;
    document.getElementById("teacherTotalTime").textContent = formatTime(totalSeconds);

    document.getElementById("teacherStudents").innerHTML = students.length
      ? students.map((student) => `
          <tr>
            <td><strong>${escapeHtml(student.full_name || "Estudiante")}</strong><small>${escapeHtml(student.email || "")}</small></td>
            <td>${student.progress_percent || 0}% <small>(${student.completed_count || 0}/368)</small></td>
            <td>${student.accuracy_percent || 0}%</td>
            <td>${formatTime(student.active_seconds)}</td>
            <td>${student.session_count || 0}</td>
            <td>${formatDate(student.last_active_at)}</td>
          </tr>
        `).join("")
      : '<tr><td colspan="6">Todavía no hay alumnos en este curso.</td></tr>';
  }

  document.getElementById("createCourseForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!teacherUser) return;
    const values = new FormData(event.currentTarget);
    setFeedback("Creando curso...");
    const { data, error } = await client
      .from("courses")
      .insert({
        name: String(values.get("name")).trim(),
        code: String(values.get("code")).trim().toUpperCase(),
        academic_year: Number(values.get("year")) || null,
        teacher_id: teacherUser.id
      })
      .select()
      .single();
    if (error) {
      setFeedback(error.code === "23505" ? "Ese código de curso ya existe." : "No se pudo crear el curso.", true);
      return;
    }
    event.currentTarget.reset();
    await loadCourses();
    await selectCourse(data);
    setFeedback("Curso creado.");
  });

  document.getElementById("addStudentForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selectedCourse) return;
    const email = String(new FormData(event.currentTarget).get("email")).trim();
    setFeedback("Agregando alumno...");
    const { data, error } = await client.rpc("teacher_add_student_by_email", {
      target_course: selectedCourse.id,
      student_email: email
    });
    if (error) {
      setFeedback(error.message || "No se pudo agregar el alumno.", true);
      return;
    }
    event.currentTarget.reset();
    await loadDashboard();
    setFeedback(data || "Alumno agregado.");
  });

  document.getElementById("refreshTeacherBtn").addEventListener("click", async () => {
    await loadCourses();
    if (selectedCourse) await loadDashboard();
  });

  window.addEventListener("vectorlab:auth-changed", (event) => {
    showTeacherAccess(event.detail?.profile, event.detail?.session);
  });

  window.setTimeout(() => {
    showTeacherAccess(
      window.vectorLabAuth?.getProfile?.(),
      window.vectorLabAuth?.getSession?.()
    );
  }, 0);
})();
