// @vitest-environment node
import { describe, expect, it } from "vitest"
import { inferRouting } from "../task-type-inference"

describe("inferRouting", () => {
  describe("interactions (no task created)", () => {
    it("treats simple questions as interactions", () => {
      const result = inferRouting("what auth library do we use?")
      expect(result.level).toBe("interaction")
    })

    it("treats status questions as interactions", () => {
      const result = inferRouting("what's the status?")
      expect(result.level).toBe("interaction")
    })

    it("treats greetings as interactions", () => {
      const result = inferRouting("hey, how's it going?")
      expect(result.level).toBe("interaction")
    })

    it("treats yes/no questions as interactions", () => {
      const result = inferRouting("is MR !42 merged?")
      expect(result.level).toBe("interaction")
    })
  })

  describe("tasks (TaskState created)", () => {
    it("detects coding task from implement + issue ref", () => {
      const result = inferRouting("implement user settings screen #101")
      expect(result.level).toBe("task")
      expect(result.taskType).toBe("coding")
    })

    it("detects coding task from build + component", () => {
      const result = inferRouting("build the profile screen")
      expect(result.level).toBe("task")
      expect(result.taskType).toBe("coding")
    })

    it("detects research task", () => {
      const result = inferRouting("research auth options for the mobile app")
      expect(result.level).toBe("task")
      expect(result.taskType).toBe("research")
    })

    it("detects review task from MR reference", () => {
      const result = inferRouting("review MR !42")
      expect(result.level).toBe("task")
      expect(result.taskType).toBe("review")
    })

    it("detects admin task from sprint planning", () => {
      const result = inferRouting("create tasks for sprint 12")
      expect(result.level).toBe("task")
      expect(result.taskType).toBe("admin")
    })

    it("explicit task_assignment always creates task", () => {
      const result = inferRouting("do something", "task_assignment")
      expect(result.level).toBe("task")
    })
  })

  describe("task type inference", () => {
    it("investigate → research", () => {
      const result = inferRouting("investigate push notification options")
      expect(result.taskType).toBe("research")
    })

    it("review code → review", () => {
      const result = inferRouting("review code in !55")
      expect(result.level).toBe("task")
      expect(result.taskType).toBe("review")
    })

    it("review with words before MR ref → review", () => {
      const result = inferRouting("review Beki's MR !42")
      expect(result.level).toBe("task")
      expect(result.taskType).toBe("review")
    })

    it("check the pull request → review", () => {
      const result = inferRouting("check the pull request for auth changes")
      expect(result.level).toBe("task")
      expect(result.taskType).toBe("review")
    })

    it("assign tasks → admin", () => {
      const result = inferRouting("assign tasks to the team")
      expect(result.level).toBe("task")
      expect(result.taskType).toBe("admin")
    })

    it("fix + issue ref → coding", () => {
      const result = inferRouting("fix the bug in #203")
      expect(result.level).toBe("task")
      expect(result.taskType).toBe("coding")
    })

    it("add feature screen → coding", () => {
      const result = inferRouting("add settings screen")
      expect(result.level).toBe("task")
      expect(result.taskType).toBe("coding")
    })
  })

  describe("Russian language support", () => {
    describe("interactions (RU)", () => {
      it("treats Russian questions as interactions", () => {
        const result = inferRouting("какой статус по задаче?")
        expect(result.level).toBe("interaction")
      })

      it("treats Russian greetings as interactions", () => {
        const result = inferRouting("привет, как дела?")
        expect(result.level).toBe("interaction")
      })
    })

    describe("tasks (RU)", () => {
      it("исследуй → research", () => {
        const result = inferRouting("исследуй варианты авторизации")
        expect(result.level).toBe("task")
        expect(result.taskType).toBe("research")
      })

      it("изучи → research", () => {
        const result = inferRouting("изучи конкурентов в сегменте")
        expect(result.level).toBe("task")
        expect(result.taskType).toBe("research")
      })

      it("сравни → research", () => {
        const result = inferRouting("сравни React и Vue для нашего проекта")
        expect(result.level).toBe("task")
        expect(result.taskType).toBe("research")
      })

      it("проанализируй → research", () => {
        const result = inferRouting("проанализируй логи за неделю")
        expect(result.level).toBe("task")
        expect(result.taskType).toBe("research")
      })

      it("проверь МР → review", () => {
        const result = inferRouting("проверь МР !42")
        expect(result.level).toBe("task")
        expect(result.taskType).toBe("review")
      })

      it("глянь код → review", () => {
        const result = inferRouting("глянь код в !55")
        expect(result.level).toBe("task")
        expect(result.taskType).toBe("review")
      })

      it("проверь мерж реквест → review", () => {
        const result = inferRouting(
          "проверь мерж реквест по авторизации",
          "task_assignment",
        )
        expect(result.taskType).toBe("review")
      })

      it("создай задачи → admin", () => {
        const result = inferRouting("создай задачи на спринт 12")
        expect(result.level).toBe("task")
        expect(result.taskType).toBe("admin")
      })

      it("назначь тикет → admin", () => {
        const result = inferRouting("назначь тикет на Сашу")
        expect(result.level).toBe("task")
        expect(result.taskType).toBe("admin")
      })

      it("спланируй спринт → admin", () => {
        const result = inferRouting("спланируй спринт на следующую неделю")
        expect(result.level).toBe("task")
        expect(result.taskType).toBe("admin")
      })

      it("реализуй экран → coding", () => {
        const result = inferRouting("реализуй экран настроек")
        expect(result.level).toBe("task")
        expect(result.taskType).toBe("coding")
      })

      it("сделай компонент → coding", () => {
        const result = inferRouting("сделай компонент для профиля")
        expect(result.level).toBe("task")
        expect(result.taskType).toBe("coding")
      })

      it("исправь баг + issue ref → coding", () => {
        const result = inferRouting("исправь баг в #203")
        expect(result.level).toBe("task")
        expect(result.taskType).toBe("coding")
      })

      it("добавь фичу → coding", () => {
        const result = inferRouting("добавь фичу уведомлений")
        expect(result.level).toBe("task")
        expect(result.taskType).toBe("coding")
      })

      it("напиши модуль → coding", () => {
        const result = inferRouting("напиши модуль логирования")
        expect(result.level).toBe("task")
        expect(result.taskType).toBe("coding")
      })

      it("explicit task_assignment with Russian content", () => {
        const result = inferRouting("сделай что-нибудь", "task_assignment")
        expect(result.level).toBe("task")
      })
    })
  })

  describe("routing decision includes reasoning", () => {
    it("provides reasoning for interactions", () => {
      const result = inferRouting("hello")
      expect(result.reasoning).toBeTruthy()
    })

    it("provides reasoning for tasks", () => {
      const result = inferRouting("implement settings screen #101")
      expect(result.reasoning).toBeTruthy()
    })
  })
})
