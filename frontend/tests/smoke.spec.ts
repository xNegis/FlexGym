import { expect, test, type APIResponse, type Page } from "@playwright/test";

const API_URL = "http://localhost:8000";
const MOBILE_VIEWPORT = { width: 390, height: 844 };

interface RoutineFixture {
  id: number;
  name: string;
  dayId: number;
}

interface ConfiguredExerciseFixture {
  id: number;
  exercise: { name: string; slug: string };
}

async function expectSuccessful(response: APIResponse) {
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

async function registerAuthenticatedUser(page: Page) {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const register = await page.request.post(`${API_URL}/api/auth/register`, {
    data: { email: `e2e-${unique}@example.com`, password: "StrongPassword123!" },
  });
  await expectSuccessful(register);
}

async function createAuthenticatedUser(page: Page) {
  await registerAuthenticatedUser(page);
  const profile = await page.request.post(`${API_URL}/api/fitness-profile`, {
    data: {
      date_of_birth: "1990-01-01",
      biological_sex: "male",
      height_cm: 180,
      weight_kg: 80,
      training_experience: "intermediate",
      primary_goal: "build_muscle",
      training_days_per_week: 4,
      preferred_workout_duration_minutes: 60,
      training_environment: "full_gym",
    },
  });
  await expectSuccessful(profile);
}

async function createRoutine(page: Page, name: string): Promise<RoutineFixture> {
  const routineResponse = await page.request.post(`${API_URL}/api/routines`, {
    data: { name, objective: "build_muscle", description: null },
  });
  const routine = (await expectSuccessful(routineResponse)) as { id: number; name: string };
  const dayResponse = await page.request.post(`${API_URL}/api/routines/${routine.id}/days`, {
    data: { name: "Upper body" },
  });
  const day = (await expectSuccessful(dayResponse)) as { id: number };
  return { id: routine.id, name: routine.name, dayId: day.id };
}

async function createConfiguredExercise(
  page: Page,
  routine: RoutineFixture,
): Promise<ConfiguredExerciseFixture> {
  const catalogResponse = await page.request.get(`${API_URL}/api/exercises`);
  const catalog = (await expectSuccessful(catalogResponse)) as Array<{
    name: string;
    slug: string;
  }>;
  const exercise = catalog.find((item) => item.slug === "machine-chest-press") ?? catalog[0];
  const createResponse = await page.request.post(
    `${API_URL}/api/routines/${routine.id}/days/${routine.dayId}/exercises`,
    {
      data: {
        exercise_slug: exercise.slug,
        target_type: "repetitions",
        rest_after_exercise_seconds: 120,
        notes: null,
        sets: [10, 10, 10].map((target) => ({
          target_value: target,
          target_weight_kg: null,
          target_rir: 2,
          tempo: null,
          rest_after_set_seconds: null,
          notes: null,
        })),
      },
    },
  );
  return (await expectSuccessful(createResponse)) as ConfiguredExerciseFixture;
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth, `${label} should not overflow horizontally`).toBeLessThanOrEqual(
    dimensions.clientWidth,
  );
}

test.describe("Public and guard flow", () => {
  test("supports auth navigation, protected redirects, and service retry", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto("/plan");
    await expect(page.getByText("Log in to FlexGym")).toBeVisible();

    await page.getByRole("link", { name: "Register" }).click();
    await expect(page.getByText("Create your account")).toBeVisible();
    await page.getByRole("link", { name: "Log in" }).click();

    await page.route("**/api/health", async (route) => {
      await route.fulfill({ status: 503, json: { status: "unavailable" } });
    });
    await page.goto("/unavailable");
    await expect(page.getByText("Unable to reach the server")).toBeVisible();
    await page.unroute("**/api/health");
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByText("Log in to FlexGym")).toBeVisible();
  });

  test("authenticated user without a profile is kept in onboarding", async ({ page }) => {
    await registerAuthenticatedUser(page);
    await page.goto("/plan");
    await expect(page.getByText("Set up your fitness profile")).toBeVisible();
    await page.goto("/login");
    await expect(page.getByText("Set up your fitness profile")).toBeVisible();
  });
});

test.describe("Authenticated mobile experience", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await createAuthenticatedUser(page);
  });

  test("main navigation is real and exposes the current destination", async ({ page }) => {
    await page.goto("/plan");
    const navigation = page.getByRole("navigation", { name: "Main navigation" });
    await expect(navigation.getByRole("button", { name: "Plan" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Routines" })).toBeVisible();

    await navigation.getByRole("button", { name: "Exercises" }).click();
    await expect(page.getByRole("heading", { name: "Exercise catalog" })).toBeVisible();
    await expect(navigation.getByRole("button", { name: "Exercises" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await navigation.getByRole("button", { name: "Profile" }).click();
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  });

  test("catalog filters survive the detail round trip", async ({ page }) => {
    const response = await page.request.get(`${API_URL}/api/exercises`);
    const exercises = (await expectSuccessful(response)) as Array<{ name: string; slug: string }>;
    expect(exercises.length).toBeGreaterThan(0);
    const exercise = exercises[0];

    await page.goto("/exercises");
    const search = page.getByLabel("Search exercises");
    await search.fill(exercise.name);
    await expect(page.getByRole("button", { name: new RegExp(exercise.name, "i") })).toBeVisible();
    await page.getByRole("button", { name: new RegExp(exercise.name, "i") }).click();
    await expect(page.getByRole("heading", { name: exercise.name })).toBeVisible();
    await page.getByRole("button", { name: "Go back" }).click();
    await expect(search).toHaveValue(exercise.name);
    await expect(page).toHaveURL(/search=/);
  });

  test("switching active routine names both routines and restores focus on Escape", async ({
    page,
  }) => {
    const suffix = Date.now();
    const first = await createRoutine(page, `Foundation ${suffix}`);
    const second = await createRoutine(page, `Progression ${suffix}`);
    const activation = await page.request.put(`${API_URL}/api/active-routine`, {
      data: { routine_id: first.id },
    });
    await expectSuccessful(activation);

    await page.goto(`/plan/routines/${second.id}`);
    const switchButton = page.getByRole("button", { name: "Switch to this routine" });
    await switchButton.click();
    const dialog = page.getByRole("dialog", { name: "Switch active routine" });
    await expect(dialog).toContainText(first.name);
    await expect(dialog).toContainText(second.name);
    await expect(dialog).toContainText("Neither routine will be deleted");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(switchButton).toBeFocused();
  });

  test("first routine activation is direct and does not open a redundant dialog", async ({
    page,
  }) => {
    const routine = await createRoutine(page, `First activation ${Date.now()}`);
    await page.goto(`/plan/routines/${routine.id}`);
    await page.getByRole("button", { name: "Activate routine" }).click();
    await expect(page.getByText("This is your active routine.")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("editing a configured exercise sends only the update contract", async ({ page }) => {
    const routine = await createRoutine(page, `Editable ${Date.now()}`);
    const configured = await createConfiguredExercise(page, routine);
    let updateBody: Record<string, unknown> | null = null;
    page.on("request", (request) => {
      if (request.method() === "PUT" && request.url().endsWith(`/exercises/${configured.id}`)) {
        updateBody = request.postDataJSON() as Record<string, unknown>;
      }
    });

    await page.goto(`/plan/routines/${routine.id}/days/${routine.dayId}/exercises`);
    const configuredExerciseButton = page.getByRole("button", {
      name: new RegExp(`^${configured.exercise.name} Repetitions`, "i"),
    });
    await configuredExerciseButton.click();
    await page.getByLabel(/Target values/).fill("11, 11, 11");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(configuredExerciseButton).toBeVisible();
    expect(updateBody).not.toBeNull();
    expect(updateBody).not.toHaveProperty("exercise_slug");
    const response = await page.request.get(
      `${API_URL}/api/routines/${routine.id}/days/${routine.dayId}/exercises`,
    );
    const configs = (await expectSuccessful(response)) as Array<{
      id: number;
      sets: Array<{ target_value: number }>;
    }>;
    expect(
      configs.find((item) => item.id === configured.id)?.sets.map((set) => set.target_value),
    ).toEqual([11, 11, 11]);
  });

  test("content-rich authenticated screens and dialog do not overflow mobile widths", async ({
    page,
  }) => {
    const routine = await createRoutine(page, `Responsive ${Date.now()}`);
    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });

      await page.goto("/exercises");
      await expect(page.getByRole("heading", { name: "Exercise catalog" })).toBeVisible();
      await expectNoHorizontalOverflow(page, `Catalog at ${width}px`);

      await page.goto(`/plan/routines/${routine.id}/days/${routine.dayId}/exercises`);
      await expect(page.getByText("No exercises configured")).toBeVisible();
      await expectNoHorizontalOverflow(page, `Training-day editor at ${width}px`);

      await page.getByRole("button", { name: "Add exercise" }).click();
      await page.getByRole("button", { name: "Select exercise from catalog" }).click();
      await expect(page.getByRole("dialog", { name: "Select exercise" })).toBeVisible();
      await expectNoHorizontalOverflow(page, `Exercise picker dialog at ${width}px`);
      await page.getByRole("button", { name: "Close", exact: true }).click();
    }
  });
});

test("public screens do not overflow supported mobile widths", async ({ page }) => {
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ["/login", "/register"]) {
      await page.goto(path);
      await expectNoHorizontalOverflow(page, `${path} at ${width}px`);
    }
  }
});
