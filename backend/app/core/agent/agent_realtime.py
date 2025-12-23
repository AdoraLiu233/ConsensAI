import logging
import asyncio
from handyllm import OpenAIClient, load_from, ChatPrompt, VM, RunConfig
from handyllm.types import PathType
from pathlib import Path

from app.core.agent.utils import extract_xml_tag
from app.core.agent.constants import PROMPT_ROOT_ECHOMIND, PROMPT_ROOT_AUTODOC
from app.types import MeetingLanguageType


prompt_position = load_from(PROMPT_ROOT_ECHOMIND / "position.hprompt", cls=ChatPrompt)
prompt_issue = load_from(PROMPT_ROOT_ECHOMIND / "issue.hprompt", cls=ChatPrompt)
prompt_heuristic = load_from(PROMPT_ROOT_ECHOMIND / "heuristic.hprompt", cls=ChatPrompt)
prompt_goal_alignment = load_from(
    PROMPT_ROOT_ECHOMIND / "goal_alignment.hprompt", cls=ChatPrompt
)
prompt_ambiguity = load_from(PROMPT_ROOT_ECHOMIND / "ambiguity.hprompt", cls=ChatPrompt)

prompt_summary = load_from(PROMPT_ROOT_AUTODOC / "summary.hprompt", cls=ChatPrompt)


class AgentRealtime:
    def __init__(self, client: OpenAIClient, base_dir: PathType):
        self.client = client
        self.is_running = False  # 是否正在进行实时处理
        self.edit_node = False  # 用户是否进行了修改

        # self.another_chosen_node = False # 用户是否选中了另一个节点
        self.generating_issue_map = False  # 是否正在进行循环
        self.generating_judge = False  # 是否正在进行判断
        self.base_dir = base_dir
        """
        这里的逻辑是：
        1. 在正常运行的时候，another_chosen_node = False, generating_issue_map = True
        2. 用户换了一个节点：
            如果issue map正在生成：another_chosen_node = True, generating_issue_map = False
                则用原来的数据生成issue map之后再进行操作
            如果issue map不在生成：another_chosen_node = True, generating_issue_map = True
                则将当前的累积字数和队列保留，继续
            如果正在judge：another_chosen_node = True, generating_judge = True
                则将当前队列推入total队列，累计字数清零，打断judge
            如果不在judge：another_chosen_node = True, generating_judge = False
                则将当前队列推入total队列，累计字数清零
        """

    # DONE 加上evaled path和output path
    async def gamma_text_to_position(
        self,
        context: str,
        issue_chain: str,
        current_positions: str,
        dialog: str,
        cnt: int,
        logger: logging.Logger,
        position_number_limitation: str,
        file_suffix: str,
        meeting_language: MeetingLanguageType,
    ):
        """
        生成新的position and note
        """
        output_path = (
            Path(self.base_dir)
            / "text_to_position"
            / f"t2p_{cnt}_result{file_suffix}.hprompt"
        ).resolve()
        output_evaled_prompt_path = (
            Path(self.base_dir)
            / "text_to_position"
            / f"t2p_{cnt}_eval{file_suffix}.hprompt"
        ).resolve()
        p_evaled = prompt_position.eval(
            var_map=VM(
                context=context,
                issue_chain=issue_chain,
                current_positions=current_positions,
                dialog=dialog,
                position_number_limitation=position_number_limitation,
                meeting_language=meeting_language,
            ),
            run_config=RunConfig(
                output_path=output_path,
                output_evaled_prompt_path=output_evaled_prompt_path,
            ),
        )
        p_evaled.run_config.credential_path = None  # 覆盖hprompt中的credential_path
        logger.info(f"[prompt_position_in] {cnt} {output_evaled_prompt_path=}")

        await asyncio.sleep(1)
        result_prompt = await p_evaled.arun(client=self.client, timeout=20)
        logger.info(f"[prompt_position_out] {cnt} {output_path=}")
        output = extract_xml_tag(result_prompt.result_str, "position_and_note").strip()
        return output

    async def gamma_text_to_issue(
        self,
        context: str,
        issue_chain: str,
        positions_list: str,
        dialog: str,
        cnt: int,
        logger: logging.Logger,
        file_suffix: str,
        meeting_language: MeetingLanguageType,
    ):
        """
        生成新的sub_issue_list
        """
        output_path = (
            Path(self.base_dir)
            / "text_to_issue"
            / f"t2i_{cnt}_result{file_suffix}.hprompt"
        ).resolve()
        output_evaled_prompt_path = (
            Path(self.base_dir)
            / "text_to_issue"
            / f"t2i_{cnt}_eval{file_suffix}.hprompt"
        ).resolve()
        p_evaled = prompt_issue.eval(
            var_map=VM(
                context=context,
                issue_chain=issue_chain,
                positions_list=positions_list,
                dialog=dialog,
                meeting_language=meeting_language,
            ),
            run_config=RunConfig(
                output_path=output_path,
                output_evaled_prompt_path=output_evaled_prompt_path,
            ),
        )
        p_evaled.run_config.credential_path = None  # 覆盖hprompt中的credential_path
        logger.info(f"[prompt_issue_in] {cnt} {output_evaled_prompt_path=}")
        # await asyncio.sleep(1)
        # raise ValueError(f"evaled path: {p_evaled.run_config.output_evaled_prompt_path}")
        result_prompt = await p_evaled.arun(client=self.client, timeout=20)
        logger.info(f"[prompt_issue_out] {cnt} {output_path=}")
        output = extract_xml_tag(result_prompt.result_str, "sub_issue_list").strip()
        return output

    async def summary_points(
        self,
        dialog: str,
        cnt: int,
        logger: logging.Logger,
        file_suffix: str,
        meeting_language: MeetingLanguageType,
    ):
        """
        生成新的 summary points
        """
        logger.info(f"[in summary_points] {cnt}")
        output_path = (
            Path(self.base_dir) / "summary" / f"sum_{cnt}_result{file_suffix}.hprompt"
        ).resolve()
        output_evaled_prompt_path = (
            Path(self.base_dir) / "summary" / f"sum_{cnt}_eval{file_suffix}.hprompt"
        ).resolve()
        p_evaled = prompt_summary.eval(
            var_map=VM(dialog=dialog, meeting_language=meeting_language),
            run_config=RunConfig(
                output_path=output_path,
                output_evaled_prompt_path=output_evaled_prompt_path,
            ),
        )
        p_evaled.run_config.credential_path = None  # 覆盖hprompt中的credential_path
        logger.info(f"[prompt_summary_in] {cnt} {output_evaled_prompt_path=}")
        result_prompt = await p_evaled.arun(client=self.client, timeout=20)
        logger.info(f"[prompt_summary_out] {cnt} {output_path=}")
        output = extract_xml_tag(result_prompt.result_str, "summary").strip()
        return output

    async def heuristic_insights(
        self,
        issue_map: str,
        dialog: str,
        summary_points: str,
        cnt: int,
        logger: logging.Logger,
        file_suffix: str,
        meeting_language: MeetingLanguageType,
    ):
        """
        生成静默提示的新视角
        """
        output_path = (
            Path(self.base_dir) / "heuristic" / f"heu_{cnt}_result{file_suffix}.hprompt"
        ).resolve()
        output_evaled_prompt_path = (
            Path(self.base_dir) / "heuristic" / f"heu_{cnt}_eval{file_suffix}.hprompt"
        ).resolve()
        p_evaled = prompt_heuristic.eval(
            var_map=VM(
                issue_map=issue_map,
                dialog=dialog,
                summary_points=summary_points,
                meeting_language=meeting_language,
            ),
            run_config=RunConfig(
                output_path=output_path,
                output_evaled_prompt_path=output_evaled_prompt_path,
            ),
        )
        p_evaled.run_config.credential_path = None  # 覆盖hprompt中的credential_path
        logger.info(f"[prompt_heuristic_in] {cnt} {output_evaled_prompt_path=}")
        result_prompt = await p_evaled.arun(client=self.client, timeout=20)
        logger.info(f"[prompt_heuristic_out] {cnt} {output_path=}")
        output = extract_xml_tag(result_prompt.result_str, "insights").strip()
        return output

    async def check_goal_alignment(
        self,
        current_goal: str,
        recent_dialog: str,
        current_map_context: str,
        focused_issue: str,
        cnt: int,
        logger: logging.Logger,
        file_suffix: str,
    ):
        """
        检查会议是否偏离目标
        """
        output_path = (
            Path(self.base_dir)
            / "goal_alignment"
            / f"goal_{cnt}_result{file_suffix}.hprompt"
        ).resolve()
        output_evaled_prompt_path = (
            Path(self.base_dir)
            / "goal_alignment"
            / f"goal_{cnt}_eval{file_suffix}.hprompt"
        ).resolve()
        p_evaled = prompt_goal_alignment.eval(
            var_map=VM(
                currentGoal=current_goal,
                recentDialog=recent_dialog,
                currentMapContext=current_map_context,
                focusedIssue=focused_issue,
            ),
            run_config=RunConfig(
                output_path=output_path,
                output_evaled_prompt_path=output_evaled_prompt_path,
            ),
        )
        p_evaled.run_config.credential_path = None
        logger.info(f"[prompt_goal_in] {cnt} {output_evaled_prompt_path=}")
        logger.info(
            f"[prompt_goal_content] currentGoal={current_goal} recentDialog={recent_dialog} currentMapContext={current_map_context} focusedIssue={focused_issue}"
        )
        result_prompt = await p_evaled.arun(client=self.client, timeout=20)
        logger.info(f"[prompt_goal_out] {cnt} {output_path=}")
        logger.info(f"[prompt_goal_result] {result_prompt.result_str}")
        return result_prompt.result_str

    async def gamma_check_ambiguity(
        self,
        dialog: str,
        positions_str: str,
        cnt: int,
        logger: logging.Logger,
        meeting_language: MeetingLanguageType,
        file_suffix: str = "",
    ):
        output_path = (
            Path(self.base_dir)
            / "ambiguity"
            / f"ambiguity_{cnt}_result{file_suffix}.hprompt"
        ).resolve()
        output_evaled_prompt_path = (
            Path(self.base_dir)
            / "ambiguity"
            / f"ambiguity_{cnt}_eval{file_suffix}.hprompt"
        ).resolve()
        p_evaled = prompt_ambiguity.eval(
            var_map=VM(
                dialog=dialog,
                positions=positions_str,
                language=meeting_language,
            ),
            run_config=RunConfig(
                output_path=output_path,
                output_evaled_prompt_path=output_evaled_prompt_path,
            ),
        )
        p_evaled.run_config.credential_path = None
        logger.info(f"[prompt_ambiguity_in] {cnt} {output_evaled_prompt_path=}")
        result_prompt = await p_evaled.arun(client=self.client, timeout=20)
        logger.info(f"[prompt_ambiguity_out] {cnt} {output_path=}")
        return result_prompt.result_str
