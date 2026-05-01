<script setup lang="ts">
import { ref, computed, watch } from "vue";
import type { Review } from "@shared/types";
import ConfidenceIndicator from "@/components/ui/ConfidenceIndicator.vue";

const props = defineProps<{
  review: Review;
}>();

type ReviewUpdatePayload = {
  reviewId: string;
  status: Review["status"];
  public_response_edited?: string;
  appeal_text?: string;
  appeal_confidence?: number;
  legal_grounds?: unknown[];
};

type ReviewRevisionPayload = ReviewUpdatePayload & {
  feedback: string;
};

const emit = defineEmits<{
  approve: [payload: ReviewUpdatePayload];
  reject: [payload: ReviewUpdatePayload];
  requestRevision: [payload: ReviewRevisionPayload];
}>();

const activeTab = ref<"response" | "appeal">("response");
const editedResponse = ref(props.review.public_response ?? "");
const editedAppeal = ref(props.review.appeal_text ?? "");
const revisionFeedback = ref("");
const showRevisionInput = ref(false);

const legalGrounds = computed(() => {
  if (!props.review.legal_grounds) return [];
  return props.review.legal_grounds as Array<{
    source: string;
    article: string;
    citation: string;
  }>;
});

const sourceLabels: Record<string, string> = {
  platform_rules: "Правила площадки",
  gk_rf: "ГК РФ",
  uk_rf: "УК РФ",
};

watch(
  () => props.review,
  (review) => {
    editedResponse.value = review.public_response ?? "";
    editedAppeal.value = review.appeal_text ?? "";
  },
  { immediate: true },
);

function handleApprove() {
  emit("approve", {
    reviewId: props.review.id,
    status: activeTab.value === "appeal" ? "appeal_sent" : "approved",
    public_response_edited: editedResponse.value || undefined,
    appeal_text: editedAppeal.value || undefined,
    appeal_confidence: props.review.appeal_confidence ?? undefined,
    legal_grounds: legalGrounds.value,
  });
}

function handleReject() {
  emit("reject", {
    reviewId: props.review.id,
    status: "rejected",
    public_response_edited: editedResponse.value || undefined,
    appeal_text: editedAppeal.value || undefined,
    appeal_confidence: props.review.appeal_confidence ?? undefined,
    legal_grounds: legalGrounds.value,
  });
}

function handleRequestRevision() {
  if (revisionFeedback.value.trim()) {
    emit("requestRevision", {
      reviewId: props.review.id,
      status: activeTab.value === "appeal" ? "edited" : "draft_ready",
      public_response_edited: editedResponse.value || undefined,
      appeal_text: editedAppeal.value || undefined,
      appeal_confidence: props.review.appeal_confidence ?? undefined,
      legal_grounds: legalGrounds.value,
      feedback: revisionFeedback.value.trim(),
    });
    revisionFeedback.value = "";
    showRevisionInput.value = false;
  }
}
</script>

<template>
  <div class="card overflow-hidden">
    <!-- Tabs -->
    <div class="flex border-b border-gray-200">
      <button
        class="flex-1 px-4 py-3 text-sm font-medium text-center transition-colors"
        :class="
          activeTab === 'response'
            ? 'text-brand-600 border-b-2 border-brand-600'
            : 'text-gray-500 hover:text-gray-700'
        "
        @click="activeTab = 'response'"
      >
        Публичный ответ
      </button>
      <button
        class="flex-1 px-4 py-3 text-sm font-medium text-center transition-colors"
        :class="
          activeTab === 'appeal'
            ? 'text-brand-600 border-b-2 border-brand-600'
            : 'text-gray-500 hover:text-gray-700'
        "
        @click="activeTab = 'appeal'"
      >
        Жалоба в модерацию
      </button>
    </div>

    <!-- Response Tab -->
    <div v-if="activeTab === 'response'" class="p-4 space-y-4">
      <div class="space-y-2">
        <label class="text-sm font-medium text-gray-700">
          Черновик публичного ответа
        </label>
        <textarea
          v-model="editedResponse"
          class="input min-h-[120px] resize-y"
          placeholder="Введите текст ответа..."
        />
      </div>

      <div class="flex gap-2">
        <button class="btn-primary flex-1" @click="handleApprove">
          Одобрить
        </button>
        <button class="btn-secondary" @click="handleReject">Отклонить</button>
        <button
          class="btn-ghost"
          @click="showRevisionInput = !showRevisionInput"
        >
          Доработать
        </button>
      </div>

      <div v-if="showRevisionInput" class="space-y-2">
        <label class="text-sm font-medium text-gray-700">
          Замечания к доработке
        </label>
        <textarea
          v-model="revisionFeedback"
          class="input min-h-[80px] resize-y"
          placeholder="Опишите, что нужно изменить..."
        />
        <button
          class="btn-primary w-full"
          :disabled="!revisionFeedback.trim()"
          @click="handleRequestRevision"
        >
          Отправить на доработку
        </button>
      </div>
    </div>

    <!-- Appeal Tab -->
    <div v-if="activeTab === 'appeal'" class="p-4 space-y-4">
      <!-- Legal Grounds Sidebar -->
      <div
        v-if="legalGrounds.length > 0"
        class="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2"
      >
        <h4 class="text-sm font-semibold text-amber-800">
          Юридические основания
        </h4>
        <div
          v-for="(ground, index) in legalGrounds"
          :key="index"
          class="text-xs text-amber-700"
        >
          <span class="font-medium">
            {{ sourceLabels[ground.source] ?? ground.source }}:
          </span>
          {{ ground.article }}
          <p class="mt-0.5 text-amber-600 italic">"{{ ground.citation }}"</p>
        </div>
      </div>

      <!-- Confidence Indicator -->
      <div
        v-if="
          review.appeal_confidence !== undefined &&
          review.appeal_confidence !== null
        "
        class="space-y-1"
      >
        <label class="text-sm font-medium text-gray-700">
          Уверенность модели
        </label>
        <ConfidenceIndicator :confidence="review.appeal_confidence" />
      </div>

      <!-- Appeal Text -->
      <div class="space-y-2">
        <label class="text-sm font-medium text-gray-700">
          Черновик апелляции
        </label>
        <textarea
          v-model="editedAppeal"
          class="input min-h-[150px] resize-y"
          placeholder="Текст апелляции..."
        />
      </div>

      <div class="flex gap-2">
        <button class="btn-primary flex-1" @click="handleApprove">
          Отправить в модерацию
        </button>
        <button class="btn-secondary" @click="handleReject">Отклонить</button>
      </div>
    </div>
  </div>
</template>
