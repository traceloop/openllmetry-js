import type { ImageUploadCallback } from "./types";

export interface MessageContent {
  type: string;
  text?: string;
  image_url?: {
    url: string;
    detail?: string;
  };
}

async function processImageInContent(
  content: MessageContent,
  traceId: string,
  spanId: string,
  uploadCallback: ImageUploadCallback,
  messageIndex: number,
  contentIndex: number
): Promise<MessageContent> {
  if (content.type !== "image_url" || !content.image_url?.url) {
    return content;
  }

  const imageUrl = content.image_url.url;
  
  // Only process data URLs or local file references
  if (imageUrl.startsWith("data:image/")) {
    try {
      // Extract base64 data from data URL
      const commaIndex = imageUrl.indexOf(",");
      if (commaIndex === -1) {
        return content;
      }
      
      const base64Data = imageUrl.substring(commaIndex + 1);
      const filename = `message_${messageIndex}_image_${contentIndex}.png`;
      
      const uploadedUrl = await uploadCallback(traceId, spanId, filename, base64Data);
      
      return {
        ...content,
        image_url: {
          ...content.image_url,
          url: uploadedUrl,
        },
      };
    } catch (error) {
      console.error("Failed to upload image from message content:", error);
      return content;
    }
  }
  
  // For regular URLs, return as-is
  return content;
}

export async function processImagesInMessages(
  messages: any[],
  traceId: string,
  spanId: string,
  uploadCallback: ImageUploadCallback
): Promise<any[]> {
  const processedMessages: any[] = [];
  
  for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
    const message = messages[messageIndex];
    
    // If content is a string, no image processing needed
    if (typeof message.content === "string") {
      processedMessages.push(message);
      continue;
    }
    
    // Process array content
    if (Array.isArray(message.content)) {
      const processedContent: MessageContent[] = [];
      
      for (let contentIndex = 0; contentIndex < message.content.length; contentIndex++) {
        const content = message.content[contentIndex];
        const processedContentItem = await processImageInContent(
          content,
          traceId,
          spanId,
          uploadCallback,
          messageIndex,
          contentIndex
        );
        processedContent.push(processedContentItem);
      }
      
      processedMessages.push({
        ...message,
        content: processedContent,
      });
    } else {
      // Unknown content type, keep as-is
      processedMessages.push(message);
    }
  }
  
  return processedMessages;
}

export function hasImagesInMessages(messages: any[]): boolean {
  return messages.some(message => {
    if (typeof message.content === "string") {
      return false;
    }
    
    if (Array.isArray(message.content)) {
      return message.content.some((content: any) => 
        content.type === "image_url" && 
        content.image_url?.url?.startsWith("data:image/")
      );
    }
    
    return false;
  });
}