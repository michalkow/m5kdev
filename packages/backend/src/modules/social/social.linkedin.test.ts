import { escapeLinkedInText } from "./social.linkedin";

describe("escapeLinkedInText", () => {
  describe("special character escaping", () => {
    it("escapes backslash", () => {
      expect(escapeLinkedInText("path\\to\\file")).toBe("path\\\\to\\\\file");
    });

    it("escapes pipe", () => {
      expect(escapeLinkedInText("a|b")).toBe("a\\|b");
    });

    it("escapes curly braces", () => {
      expect(escapeLinkedInText("{value}")).toBe("\\{value\\}");
    });

    it("escapes at symbol", () => {
      expect(escapeLinkedInText("email@example.com")).toBe("email\\@example.com");
    });

    it("escapes square brackets", () => {
      expect(escapeLinkedInText("[item]")).toBe("\\[item\\]");
    });

    it("escapes parentheses", () => {
      expect(escapeLinkedInText("(note)")).toBe("\\(note\\)");
    });

    it("escapes angle brackets", () => {
      expect(escapeLinkedInText("<html>")).toBe("\\<html\\>");
    });

    it("escapes hash when not a hashtag", () => {
      expect(escapeLinkedInText("item #1")).toBe("item \\#1");
    });

    it("escapes asterisk", () => {
      expect(escapeLinkedInText("*bold*")).toBe("\\*bold\\*");
    });

    it("escapes underscore", () => {
      expect(escapeLinkedInText("_italic_")).toBe("\\_italic\\_");
    });

    it("escapes tilde", () => {
      expect(escapeLinkedInText("~strikethrough~")).toBe("\\~strikethrough\\~");
    });

    it("escapes multiple special characters together", () => {
      expect(escapeLinkedInText("Check out (this) & [that]!")).toBe(
        "Check out \\(this\\) & \\[that\\]!"
      );
    });
  });

  describe("mentions preservation", () => {
    it("preserves person mention", () => {
      const input = "Hello @[John Doe](urn:li:person:123456)!";
      const result = escapeLinkedInText(input);
      expect(result).toBe("Hello @[John Doe](urn:li:person:123456)!");
    });

    it("preserves organization mention", () => {
      const input = "Check out @[DevtestCo](urn:li:organization:2414183)";
      const result = escapeLinkedInText(input);
      expect(result).toBe("Check out @[DevtestCo](urn:li:organization:2414183)");
    });

    it("preserves mention without fallback text", () => {
      const input = "Mention @[](urn:li:person:123) here";
      const result = escapeLinkedInText(input);
      expect(result).toBe("Mention @[](urn:li:person:123) here");
    });

    it("preserves multiple mentions", () => {
      const input = "Thanks @[Alice](urn:li:person:111) and @[Bob](urn:li:person:222)!";
      const result = escapeLinkedInText(input);
      expect(result).toBe("Thanks @[Alice](urn:li:person:111) and @[Bob](urn:li:person:222)!");
    });

    it("escapes text around mentions", () => {
      const input = "(Hello) @[John](urn:li:person:123) [world]";
      const result = escapeLinkedInText(input);
      expect(result).toBe("\\(Hello\\) @[John](urn:li:person:123) \\[world\\]");
    });
  });

  describe("hashtag template preservation", () => {
    it("preserves hashtag template with escaped hash", () => {
      const input = "Check {hashtag|\\#|MyTag}";
      const result = escapeLinkedInText(input);
      expect(result).toBe("Check {hashtag|\\#|MyTag}");
    });

    it("preserves hashtag template with unescaped hash", () => {
      const input = "Check {hashtag|#|MyTag}";
      const result = escapeLinkedInText(input);
      expect(result).toBe("Check {hashtag|#|MyTag}");
    });

    it("preserves hashtag template with fullwidth hash", () => {
      const input = "Check {hashtag|＃|MyTag}";
      const result = escapeLinkedInText(input);
      expect(result).toBe("Check {hashtag|＃|MyTag}");
    });

    it("preserves multiple hashtag templates", () => {
      const input = "{hashtag|\\#|Tag1} and {hashtag|\\#|Tag2}";
      const result = escapeLinkedInText(input);
      expect(result).toBe("{hashtag|\\#|Tag1} and {hashtag|\\#|Tag2}");
    });
  });

  describe("simple hashtag conversion", () => {
    it("converts simple hashtag to template format", () => {
      const input = "Check out #MyHashtag";
      const result = escapeLinkedInText(input);
      expect(result).toBe("Check out {hashtag|\\#|MyHashtag}");
    });

    it("converts multiple simple hashtags", () => {
      const input = "#Hello #World";
      const result = escapeLinkedInText(input);
      expect(result).toBe("{hashtag|\\#|Hello} {hashtag|\\#|World}");
    });

    it("converts hashtag with accented characters", () => {
      const input = "#Café #Naïve";
      const result = escapeLinkedInText(input);
      expect(result).toBe("{hashtag|\\#|Café} {hashtag|\\#|Naïve}");
    });

    it("handles hashtag at end of text", () => {
      const input = "Great post #Amazing";
      const result = escapeLinkedInText(input);
      expect(result).toBe("Great post {hashtag|\\#|Amazing}");
    });

    it("does not convert hash followed by number only", () => {
      const input = "Item #1 is great";
      const result = escapeLinkedInText(input);
      expect(result).toBe("Item \\#1 is great");
    });
  });

  describe("mixed content", () => {
    it("handles mentions, hashtags, and special chars together", () => {
      const input =
        "Hello @[John](urn:li:person:123)! Check out #Tech & (amazing) *stuff*";
      const result = escapeLinkedInText(input);
      expect(result).toBe(
        "Hello @[John](urn:li:person:123)! Check out {hashtag|\\#|Tech} & \\(amazing\\) \\*stuff\\*"
      );
    });

    it("handles pre-formatted hashtag template with mentions", () => {
      const input =
        "@[Company](urn:li:organization:123) is doing {hashtag|\\#|GreatThings}!";
      const result = escapeLinkedInText(input);
      expect(result).toBe(
        "@[Company](urn:li:organization:123) is doing {hashtag|\\#|GreatThings}!"
      );
    });

    it("preserves newlines and escapes special chars", () => {
      const input = "Line 1 (note)\nLine 2 [item]";
      const result = escapeLinkedInText(input);
      expect(result).toBe("Line 1 \\(note\\)\nLine 2 \\[item\\]");
    });
  });

  describe("edge cases", () => {
    it("handles empty string", () => {
      expect(escapeLinkedInText("")).toBe("");
    });

    it("handles plain text without special characters", () => {
      const input = "Hello world this is plain text";
      expect(escapeLinkedInText(input)).toBe("Hello world this is plain text");
    });

    it("handles text with only special characters", () => {
      expect(escapeLinkedInText("@#$")).toBe("\\@\\#$");
    });

    it("does not double-escape already escaped backslashes in mentions", () => {
      const input = "@[Test\\Name](urn:li:person:123)";
      const result = escapeLinkedInText(input);
      // The mention is preserved as-is, including internal backslash
      expect(result).toBe("@[Test\\Name](urn:li:person:123)");
    });
  });

  describe("real-world posts", () => {
    it("handles a full LinkedIn post with hashtags and special characters", () => {
      const input = `I tried that prompt going around lately: "Draw a picture of how I'm treating you."


My result was just a happy little bot (picture included).


But when I scrolled through LinkedIn, I noticed something different. People were posting unhappy bots: overworked assistants and robots in chains. There was a lot of "you did it wrong" or "fix it" energy.


Here is the thing: I don't anthropomorphize AI. I don't chat with it about my day. I use it as a tool for specific tasks. Yet, I still find myself typing "please" and "thank you" in my prompts.


I am the same way with games. In RPGs, I almost always pick the "good guy" route. I tried to play the renegade path in Mass Effect once and couldn't even finish it. It just felt wrong.


Contrast that with a trend I've been seeing lately. There are papers and plenty of anecdotes suggesting that negative feedback, harsh wording, or even subtle "threats" can actually squeeze better answers out of these models.


That creates a weird tension for me:


Intellectually, I know adversarial prompting can work.
Practically, I can't bring myself to be mean to what is essentially linear algebra wrapped in a UI.
Personally, I don't think training myself to be rude, even to a tool, is a habit I want to cultivate.


Maybe the real optimization isn't about being harsh, but being clear. Well-scoped tasks, concrete constraints, and explicit feedback usually do the heavy lifting anyway.


I'm curious how others handle this, especially if you spend most of day in AI tools:


Do you consciously change your tone to get better results?
Have you actually seen consistent gains from theating or adversarial prompts?
Do you think how we talk to AI will eventually bleed into how we talk to humans?


#AI #LLM #PromptEngineering`;

      const expected = `I tried that prompt going around lately: "Draw a picture of how I'm treating you."


My result was just a happy little bot \\(picture included\\).


But when I scrolled through LinkedIn, I noticed something different. People were posting unhappy bots: overworked assistants and robots in chains. There was a lot of "you did it wrong" or "fix it" energy.


Here is the thing: I don't anthropomorphize AI. I don't chat with it about my day. I use it as a tool for specific tasks. Yet, I still find myself typing "please" and "thank you" in my prompts.


I am the same way with games. In RPGs, I almost always pick the "good guy" route. I tried to play the renegade path in Mass Effect once and couldn't even finish it. It just felt wrong.


Contrast that with a trend I've been seeing lately. There are papers and plenty of anecdotes suggesting that negative feedback, harsh wording, or even subtle "threats" can actually squeeze better answers out of these models.


That creates a weird tension for me:


Intellectually, I know adversarial prompting can work.
Practically, I can't bring myself to be mean to what is essentially linear algebra wrapped in a UI.
Personally, I don't think training myself to be rude, even to a tool, is a habit I want to cultivate.


Maybe the real optimization isn't about being harsh, but being clear. Well-scoped tasks, concrete constraints, and explicit feedback usually do the heavy lifting anyway.


I'm curious how others handle this, especially if you spend most of day in AI tools:


Do you consciously change your tone to get better results?
Have you actually seen consistent gains from theating or adversarial prompts?
Do you think how we talk to AI will eventually bleed into how we talk to humans?


{hashtag|\\#|AI} {hashtag|\\#|LLM} {hashtag|\\#|PromptEngineering}`;

      expect(escapeLinkedInText(input)).toBe(expected);
    });
  });
});
